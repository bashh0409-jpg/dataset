"use client";

import {
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  KeyRound,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { createApiKey } from "@/app/actions/api-keys";

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type DeveloperPanelProps = {
  initialKeys: ApiKeySummary[];
};

const formatDate = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
        new Date(date),
      )
    : "Never";

const skeletonWidths = ["w-36", "w-[118px]", "w-40"] as const;

export default function DeveloperPanel({ initialKeys }: DeveloperPanelProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setCreatedKey(null);
    setCopied(false);
    setBusy(true);

    try {
      const result = await createApiKey(keyName);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      const { key, ...summary } = result.data;
      setCreatedKey(key);
      setKeys((current) => [
        { ...summary, lastUsedAt: null, revokedAt: null },
        ...current,
      ]);
      setKeyName("");
      setShowForm(false);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setError("");
    } catch {
      setError("Couldn't copy the key. Select and copy it manually.");
    }
  };

  const openCreateForm = () => {
    setError("");
    setCreatedKey(null);
    setShowForm(true);
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[26px] pb-12 pt-[64px] text-[#111827] max-sm:px-4 max-sm:pt-14">
      <header>
        <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.035em]">
          Manage
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[15px] leading-6 text-[#5e687a]">
          <p className="geist text-[#999] font-semibold tracking-tight"></p>
          <p className="geist  text-left max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
            Create keys that let your apps use the API.
          </p>
          <button
            aria-expanded={showHelp}
            className="geist  text-left flex hidden hover:underline cursor-pointer max-w-xs text-sm font-medium leading-4 tracking-tight text-[#1769ff]"
            onClick={() => setShowHelp((shown) => !shown)}
            type="button"
          >
            How API keys work
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        {showHelp && (
          <p className="mt-2 max-w-2xl rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] leading-5 text-[#5e687a]">
            Use an API key to authenticate requests from your app. The secret is
            shown only once when it is created; only a secure hash is stored.
          </p>
        )}
      </header>

      {showForm && (
        <form
          className="mt-5 rounded-lg border border-[#e5e7eb] bg-white p-4 shadow-sm"
          onSubmit={submit}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">
                Create an API key
              </h3>
              <p className="mt-1 text-[13px] text-[#667085]">
                Choose a name to recognize where this key is used.
              </p>
            </div>
            <button
              aria-label="Close form"
              className="rounded p-1 text-[#667085] hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff]"
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <label className="mt-4 block text-[13px] font-medium text-[#344054]">
            Key name
            <input
              autoFocus
              className="mt-1.5 block h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm text-[#101828] outline-none placeholder:text-[#98a2b3] focus:border-[#3282ff] focus:ring-2 focus:ring-[#3282ff]/20"
              maxLength={80}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="e.g. Local development"
              required
              value={keyName}
            />
          </label>
          {error && (
            <p className="mt-2 text-[13px] text-[#b42318]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="h-9 rounded-md border border-[#d0d5dd] px-3 text-[13px] font-medium text-[#344054] hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff]"
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#3282ff] px-3 text-[13px] font-medium text-white hover:bg-[#1769ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !keyName.trim()}
              type="submit"
            >
              <Plus aria-hidden="true" className="size-4" />
              {busy ? "Creating..." : "Create key"}
            </button>
          </div>
        </form>
      )}

      {error && !showForm && (
        <p
          className="mt-4 rounded-md border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#b42318]"
          role="alert"
        >
          {error}
        </p>
      )}

      {createdKey && (
        <section
          aria-label="New API key"
          className="mt-4 rounded-lg border border-[#b2ddff] bg-[#eff8ff] p-4"
          role="status"
        >
          <h3 className="text-sm font-semibold text-[#1849a9]">
            API key created
          </h3>
          <p className="mt-1 text-[13px] text-[#3538cd]">
            Copy this key now. For security, it won&apos;t be shown again.
          </p>
          <div className="mt-3 flex min-w-0 items-center gap-2 max-sm:items-stretch">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[#d0d5dd] bg-white px-3 py-2 font-mono text-[13px] text-[#344054]">
              {createdKey}
            </code>
            <button
              aria-label={copied ? "API key copied" : "Copy API key"}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[#d0d5dd] bg-white px-3 text-[13px] font-medium text-[#344054] hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff]"
              onClick={() => void copyKey()}
              type="button"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      )}

      <section
        aria-label="API key list"
        className="relative mt-[18px] min-h-[496px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="h-[52px] border-b border-[#f0f1f3] text-[11px] font-medium uppercase tracking-tight text-[#667085]">
                <th className="w-[38%] px-5 font-medium">
                  <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    <KeyRound aria-hidden="true" className="size-3.5" />
                    Api key
                  </p>
                </th>
                <th className="w-[17%] px-4 font-medium">
                  <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    <Shield aria-hidden="true" className="size-3.5" />
                    Scope
                  </p>
                </th>
                <th className="w-[16%] px-4 font-medium">
                  <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    <Clock3 aria-hidden="true" className="size-3.5" />
                    Created
                  </p>
                </th>
                <th className="w-[16%] px-4 font-medium">
                  <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    Last used
                  </p>
                </th>
                <th className="w-[13%] px-4 font-medium">
                  <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    Expires
                  </p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f3f5]">
              {keys.map((key) => (
                <tr className="h-[64px] text-[13px]" key={key.id}>
                  <td className="px-5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="geist inline-flex gap-1 items-center text-left max-w-xs text-sm font-medium leading-4 tracking-tight">
                        {key.name}
                      </p>
                      <span className="truncate font-medium text-[#344054]">
                        {key.revokedAt && (
                          <span className="ml-2 rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-medium text-[#667085]">
                            Revoked
                          </span>
                        )}
                      </span>

                      <p className="geist text-[#999] inline-flex gap-1 items-center text-left max-w-xs text-xs font-medium leading-4 tracking-tight">
                        {key.prefix}••••••••••••
                      </p>
                    </div>
                  </td>
                  <td className="px-4 text-[#475467]">
                    {" "}
                    <p className="geist text-[#999] inline-flex gap-1 items-center text-left max-w-xs text-sm font-medium leading-4 tracking-tight">
                      Full access
                    </p>
                  </td>

                  <td className="px-4 text-[#475467]">
                    <p className="geist text-[#999] inline-flex gap-1 items-center text-left max-w-xs text-sm font-medium leading-4 tracking-tight">
                      {formatDate(key.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 text-[#475467]">
                    <p className="geist text-[#999] inline-flex gap-1 items-center text-left max-w-xs text-sm font-medium leading-4 tracking-tight">
                      {formatDate(key.lastUsedAt)}
                    </p>
                  </td>
                  <td className="px-4 text-[#475467]">
                    <p className="geist text-[#999] inline-flex gap-1 items-center text-left max-w-xs text-sm font-medium leading-4 tracking-tight">
                      Never
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {keys.length === 0 ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-[52px] flex flex-col gap-[47px] px-[18px] opacity-[0.45]"
            >
              {skeletonWidths.map((widthClass, index) => (
                <div
                  className="grid h-4 grid-cols-[38%_17%_16%_16%_13%] items-center"
                  key={index}
                >
                  <span
                    className={`h-[9px] rounded-full bg-[#e9ebef] ${widthClass}`}
                  />
                  <span className="flex items-center gap-3">
                    <i className="size-1.5 rounded-full bg-[#e9ebef]" />
                    <i className="h-[9px] w-[58px] rounded-full bg-[#e9ebef]" />
                  </span>
                  <i className="h-[9px] w-10 rounded-full bg-[#e9ebef]" />
                  <i className="h-[9px] w-10 rounded-full bg-[#e9ebef]" />
                  <i className="h-[9px] w-12 rounded-full bg-[#e9ebef]" />
                </div>
              ))}
            </div>
            <div className="absolute inset-x-4 bottom-[50px] flex flex-col items-center text-center">
              <KeyRound
                aria-hidden="true"
                className="size-7 stroke-[1.7] text-[#667085]"
              />
              <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#101828]">
                No API keys yet
              </h3>
              <p className="mt-3 text-[14px] text-[#667085]">
                Create your first key to authenticate requests to the API.
              </p>
              <button
                className="mt-4 inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#3282ff] px-4 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#1769ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff]"
                onClick={openCreateForm}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                Create key
              </button>
            </div>
          </>
        ) : (
          <div className="absolute bottom-4 right-4">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#3282ff] px-3 text-[13px] font-medium text-white transition hover:bg-[#1769ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769ff]"
              onClick={openCreateForm}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              Create key
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
