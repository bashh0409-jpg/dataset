import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";

const maxRedirects = 3;
const maxResponseBytes = 128_000;
const maxPageCharacters = 8_000;
const requestTimeoutMs = 8_000;

type PublicAddress = {
  address: string;
  family: 4 | 6;
};

export class LinkReadError extends Error {}

export function extractLinksFromText(text: string) {
  const links = text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  return [
    ...new Set(
      links
        .map((link) => link.replace(/[.,!?;:]+$/, "").replace(/[)\]}]+$/, ""))
        .filter(Boolean),
    ),
  ];
}

function isIpv4Public(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 168 && b === 63 && c === 129 && octets[3] === 16) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string) {
  if (address.includes("%")) return null;

  let value = address.toLowerCase();
  const ipv4Suffix = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Suffix) {
    if (isIP(ipv4Suffix[1]) !== 4) return null;
    const [high, low] = ipv4Suffix[1].split(".").map(Number).reduce<number[]>(
      (groups, octet, index) => {
        const groupIndex = Math.floor(index / 2);
        groups[groupIndex] =
          ((groups[groupIndex] ?? 0) << 8) | octet;
        return groups;
      },
      [],
    );
    value = value.replace(
      ipv4Suffix[0],
      `:${high.toString(16)}:${low.toString(16)}`,
    );
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missingGroups = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missingGroups !== 0) ||
    (halves.length === 2 && missingGroups < 1)
  ) {
    return null;
  }

  const groups = [
    ...left,
    ...Array.from({ length: missingGroups }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }

  return groups.map((group) => Number.parseInt(group, 16));
}

function isIpv6Public(address: string) {
  const value = parseIpv6(address);
  if (!value || value[0] >> 13 !== 1) return false;

  return !(
    (value[0] === 0x2001 && value[1] === 0x0db8) ||
    (value[0] === 0x2001 && value[1] >> 9 === 0) ||
    value[0] === 0x2002
  );
}

function isPublicAddress(address: string, family: number) {
  return family === 4
    ? isIP(address) === 4 && isIpv4Public(address)
    : family === 6 && isIP(address) === 6 && isIpv6Public(address);
}

export function validatePublicHttpsUrl(value: string) {
  if (value.length > 2_048) {
    throw new LinkReadError("One of the links is too long to read.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LinkReadError("One of the links is not a valid URL.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new LinkReadError(
      "Only public HTTPS links on the standard secure port can be read.",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new LinkReadError("Private and local network links cannot be read.");
  }
  const ipFamily = isIP(hostname);
  if (ipFamily && !isPublicAddress(hostname, ipFamily)) {
    throw new LinkReadError("Private and non-public network links cannot be read.");
  }

  url.hash = "";
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<PublicAddress> {
  const ipFamily = isIP(hostname);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = ipFamily
    ? [{ address: hostname, family: ipFamily }]
    : await Promise.race([
        dnsLookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new LinkReadError("Looking up the linked page timed out."),
              ),
            requestTimeoutMs,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });

  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => !isPublicAddress(address, family))
  ) {
    throw new LinkReadError("Private or non-public network links cannot be read.");
  }

  const address = addresses[0];
  if (address.family !== 4 && address.family !== 6) {
    throw new LinkReadError("The link host could not be resolved safely.");
  }
  return { address: address.address, family: address.family };
}

function readResponse(response: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    response.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > maxResponseBytes) {
        response.destroy();
        reject(
          new LinkReadError("The linked page is too large to read (128 KB max)."),
        );
        return;
      }
      chunks.push(buffer);
    });
    response.once("end", () => resolve(Buffer.concat(chunks)));
    response.once("error", reject);
  });
}

function requestPage(
  url: URL,
  address: PublicAddress,
  signal: AbortSignal,
) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        headers: {
          Accept:
            "text/html, application/xhtml+xml, text/plain, text/markdown, application/json",
          "User-Agent": "SyntheticLinkReader/1.0",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [address]);
          } else {
            callback(null, address.address, address.family);
          }
        },
        signal,
      },
      resolve,
    );
    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new LinkReadError("Reading the linked page timed out."));
    });
    request.once("error", reject);
    request.end();
  });
}

function decodeHtmlEntities(text: string) {
  return text.replace(
    /&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi,
    (entity, value: string) => {
      const namedEntities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };
      if (!value.startsWith("#")) {
        return namedEntities[value.toLowerCase()] ?? entity;
      }

      const codePoint = value[1]?.toLowerCase() === "x"
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

export function extractReadablePageText(content: string, contentType: string) {
  let text = content;
  if (/^(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(
        /<\/(?:p|div|li|h[1-6]|tr|section|article|main|pre|blockquote)\s*>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, " ");
    text = decodeHtmlEntities(text);
  }

  return text
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxPageCharacters);
}

export async function readPublicHttpsPage(link: string) {
  let url = validatePublicHttpsUrl(link);
  const signal = AbortSignal.timeout(
    requestTimeoutMs * (maxRedirects + 1) + 2_000,
  );

  for (let redirects = 0; ; redirects += 1) {
    if (signal.aborted) {
      throw new LinkReadError("Reading the linked page timed out.");
    }

    let response: IncomingMessage;
    try {
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const address = await resolvePublicAddress(hostname);
      response = await requestPage(url, address, signal);
    } catch (error) {
      if (error instanceof LinkReadError) throw error;
      if (signal.aborted) {
        throw new LinkReadError("Reading the linked page timed out.");
      }
      throw new LinkReadError(
        "Could not read the link. Check that it is a public HTTPS page and try again.",
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = response.headers.location;
      response.resume();
      if (!location) {
        throw new LinkReadError("The linked page returned an invalid redirect.");
      }
      if (redirects >= maxRedirects) {
        throw new LinkReadError("The link redirected too many times to read safely.");
      }
      try {
        url = validatePublicHttpsUrl(new URL(location, url).href);
      } catch (error) {
        if (error instanceof LinkReadError) throw error;
        throw new LinkReadError("The linked page returned an invalid redirect.");
      }
      continue;
    }

    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
      response.resume();
      throw new LinkReadError(
        `The linked page returned HTTP ${response.statusCode ?? "error"}.`,
      );
    }

    const contentType = response.headers["content-type"] ?? "";
    if (
      !/^(?:text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/json)\b/i.test(
        contentType,
      )
    ) {
      response.resume();
      throw new LinkReadError(
        "This link is not a readable HTML, text, Markdown, or JSON page.",
      );
    }

    const contentLength = Number(response.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      response.resume();
      throw new LinkReadError("The linked page is too large to read (128 KB max).");
    }

    const body = await readResponse(response);
    const text = extractReadablePageText(body.toString("utf8"), contentType);
    if (!text) {
      throw new LinkReadError("The linked page did not contain readable text.");
    }

    return { url: url.href, text };
  }
}
