"use client";

import Image from "next/image";
import Script from "next/script";
import { Download, Mic, Paperclip, Square, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { submitBugReport } from "@/app/actions/bug-reports";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "invisible";
      execution: "execute";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type BugReportDiagnostics = {
  app: "Synthetic";
  pagePath: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  language: string;
  timezone: string;
  collectedAt: string;
};

type VoiceNote = {
  file: File;
  url: string;
};

type ImageAttachment = {
  id: string;
  file: File;
  url: string;
};

type BugReportDialogProps = {
  onClose: () => void;
};

const attachmentBucket = "bug-report-attachments";
const maxImageCount = 5;
const maxImageSize = 5 * 1024 * 1024;
const maxVoiceNoteSize = 10 * 1024 * 1024;
const maxVoiceNoteDurationSeconds = 90;
const allowedImages = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mpeg";
    case "audio/wav":
      return "wav";
    default:
      return null;
  }
}

export default function BugReportDialog({ onClose }: BugReportDialogProps) {
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState({ left: 16, bottom: 16 });
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [turnstileError, setTurnstileError] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstilePendingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const voiceNoteUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const imagesRef = useRef<ImageAttachment[]>([]);
  const attachmentComposerRef = useRef<HTMLDivElement>(null);
  const imagePreviewRef = useRef<HTMLElement>(null);

  const renderTurnstile = () => {
    if (
      !turnstileSiteKey ||
      !turnstileContainerRef.current ||
      !window.turnstile ||
      turnstileWidgetIdRef.current
    ) {
      return;
    }

    try {
      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: turnstileSiteKey,
          action: "bug_report",
          theme: "light",
          size: "invisible",
          execution: "execute",
          callback: (token) => {
            setTurnstileError("");
            if (turnstilePendingRef.current) {
              turnstilePendingRef.current = false;
              void submitReport(token);
            }
          },
          "expired-callback": () => {
            if (turnstilePendingRef.current) {
              turnstilePendingRef.current = false;
              setSubmitting(false);
            }
            setTurnstileError(
              "The security check expired. Please complete it again.",
            );
          },
          "error-callback": () => {
            if (turnstilePendingRef.current) {
              turnstilePendingRef.current = false;
              setSubmitting(false);
            }
            setTurnstileError(
              "The security check could not load. Please try again.",
            );
          },
        },
      );
    } catch (renderError) {
      console.error("Unable to render the bug report Turnstile widget.", renderError);
      setTurnstileError("The security check could not load. Please try again.");
    }
  };

  useEffect(
    () => () => {
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && previewImageId) {
        event.stopPropagation();
        setPreviewImageId(null);
        return;
      }
      if (event.key === "Escape" && !submitting && !recording) onClose();
    };

    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose, previewImageId, recording, submitting]);

  useEffect(() => {
    if (!previewImageId) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        imagePreviewRef.current?.contains(target) ||
        target.closest("[data-preview-thumb]")
      ) {
        return;
      }
      setPreviewImageId(null);
    };
    // The stored position goes stale on resize, so just close the preview.
    const close = () => setPreviewImageId(null);

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", close);
    };
  }, [previewImageId]);

  // Move focus into the preview when it opens.
  useEffect(() => {
    if (previewImageId) imagePreviewRef.current?.focus();
  }, [previewImageId]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (voiceNoteUrlRef.current) {
        URL.revokeObjectURL(voiceNoteUrlRef.current);
        voiceNoteUrlRef.current = null;
      }
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
      imagesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (
      recording &&
      recordingSeconds >= maxVoiceNoteDurationSeconds &&
      recorderRef.current?.state === "recording"
    ) {
      recorderRef.current.stop();
    }
  }, [recording, recordingSeconds]);

  const handleImagesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (images.length + selected.length > maxImageCount) {
      setError(`You can attach up to ${maxImageCount} images.`);
      return;
    }

    const invalidImage = selected.find(
      (file) => !allowedImages.has(file.type) || file.size > maxImageSize,
    );
    if (invalidImage) {
      setError("Images must be JPG, PNG, WebP, or GIF files up to 5 MB each.");
      return;
    }

    const newImages = selected.map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((current) => {
      const next = [...current, ...newImages];
      imagesRef.current = next;
      return next;
    });
  };

  const removeImage = (image: ImageAttachment) => {
    URL.revokeObjectURL(image.url);
    setImages((current) => {
      const next = current.filter((item) => item.id !== image.id);
      imagesRef.current = next;
      return next;
    });
    setPreviewImageId((current) => (current === image.id ? null : current));
  };

  const togglePreview = (id: string, thumb: HTMLElement) => {
    if (previewImageId === id) {
      setPreviewImageId(null);
      return;
    }
    const rect = thumb.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    setPreviewPos({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      bottom: window.innerHeight - rect.top + 10, // 10px gap above the thumbnail
    });
    setPreviewImageId(id);
  };

  const startVoiceNote = async () => {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Voice recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = [
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setRecordingSeconds(0);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const extension = extensionForMimeType(
          blob.type.split(";")[0].toLowerCase(),
        );
        if (!extension) {
          if (mountedRef.current) {
            setError(
              "This browser produced an unsupported voice recording format.",
            );
          }
        } else if (blob.size > maxVoiceNoteSize) {
          if (mountedRef.current) {
            setError(
              "The voice note is too large. Please record a shorter note.",
            );
          }
        } else if (blob.size > 0) {
          const file = new File([blob], `voice-note.${extension}`, {
            type: blob.type.split(";")[0].toLowerCase(),
          });
          const url = URL.createObjectURL(file);
          if (voiceNoteUrlRef.current)
            URL.revokeObjectURL(voiceNoteUrlRef.current);
          voiceNoteUrlRef.current = url;
          if (mountedRef.current) setVoiceNote({ file, url });
          else URL.revokeObjectURL(url);
        }
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (mountedRef.current) setRecording(false);
      });
      recorder.start();
      setRecording(true);
    } catch {
      setError(
        "Microphone access was not available. Allow microphone access and try again.",
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopVoiceNote = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const removeVoiceNote = () => {
    if (voiceNote?.url) URL.revokeObjectURL(voiceNote.url);
    voiceNoteUrlRef.current = null;
    setVoiceNote(null);
  };

  const removeUploadedFiles = async (
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    paths: string[],
  ) => {
    if (paths.length === 0) return null;
    const { error: cleanupError } = await supabase.storage
      .from(attachmentBucket)
      .remove(paths);
    return cleanupError;
  };

  async function submitReport(token: string) {
    const uploadedPaths: string[] = [];
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let reportSubmitted = false;

    try {
      supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setError("Please sign in again before sending a bug report.");
        return;
      }

      const files = [
        ...images.map((image) => image.file),
        ...(voiceNote ? [voiceNote.file] : []),
      ];
      for (const file of files) {
        const extension = extensionForMimeType(file.type);
        if (!extension) {
          throw new Error(
            "One of the selected files uses an unsupported format.",
          );
        }
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(attachmentBucket)
          .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) {
          throw new Error("Unable to upload an attachment. Please try again.");
        }
        uploadedPaths.push(path);
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const diagnostics: BugReportDiagnostics | null = includeDiagnostics
        ? {
            app: "Synthetic",
            pagePath: window.location.pathname,
            userAgent: navigator.userAgent,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            language: navigator.language,
            timezone: timezone || "unknown",
            collectedAt: new Date().toISOString(),
          }
        : null;
      const result = await submitBugReport({
        description,
        attachmentPaths: uploadedPaths,
        diagnostics,
        turnstileToken: token,
      });

      if ("error" in result) {
        const cleanupError = await removeUploadedFiles(supabase, uploadedPaths);
        setError(
          cleanupError
            ? `${result.error} Uploaded files could not be removed; please contact support.`
            : result.error,
        );
        return;
      }

      reportSubmitted = true;
      setSubmitted(true);
    } catch (submitError) {
      let cleanupError = null;
      if (supabase) {
        cleanupError = await removeUploadedFiles(supabase, uploadedPaths);
      }
      setError(
        `${submitError instanceof Error ? submitError.message : "A network error occurred. Please try again."}${
          cleanupError
            ? " Uploaded files could not be removed; please contact support."
            : ""
        }`,
      );
    } finally {
      setSubmitting(false);
      if (!reportSubmitted) {
        if (turnstileWidgetIdRef.current) {
          window.turnstile?.reset(turnstileWidgetIdRef.current);
        }
      }
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setTurnstileError("");
    if (
      !turnstileSiteKey ||
      !turnstileWidgetIdRef.current ||
      !window.turnstile
    ) {
      setError("Security verification is unavailable. Please try again later.");
      return;
    }

    setSubmitting(true);
    turnstilePendingRef.current = true;
    try {
      window.turnstile.execute(turnstileWidgetIdRef.current);
    } catch (executeError) {
      console.error(
        "Unable to execute the bug report Turnstile check.",
        executeError,
      );
      turnstilePendingRef.current = false;
      setSubmitting(false);
      setTurnstileError("The security check could not start. Please try again.");
    }
  };

  const minutes = Math.floor(recordingSeconds / 60);
  const seconds = String(recordingSeconds % 60).padStart(2, "0");

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting && !recording) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="bug-report-title"
        aria-modal="true"
        className="max-h-[min(90vh,700px)] w-full max-w-md overflow-y-auto rounded-3xl bg-white px-4 pb-4 pt-4 text-[#111827] shadow-xl"
        role="dialog"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-[16px] font-semibold tracking-tight text-[#000]"
              id="bug-report-title"
            >
              {submitted ? "Report received" : "Report a bug"}
            </h2>
            <p className="geist mt-1 text-sm font-medium leading-4 tracking-tight text-[#999]">
              {submitted
                ? "Thanks for helping us improve Synthetic."
                : "Tell us what happened in your workspace."}
            </p>
          </div>
          <button
            aria-label="Close bug report"
            autoFocus
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#858780]"
            disabled={submitting || recording}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        {submitted ? (
          <div className="rounded-md bg-[#f2f4f7] p-3">
            <p className="text-[13px] font-medium text-[#027a48]" role="status">
              Your report was sent. Thanks for helping us improve Synthetic.
            </p>
            <button
              className="geist mt-4 w-fit cursor-pointer rounded bg-black p-2 text-[13px] font-semibold leading-3 tracking-tight text-white transition duration-300 hover:bg-black/60"
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="relative" ref={attachmentComposerRef}>
              <div className="overflow-hidden rounded-md border border-[#d0d5dd] bg-white focus-within:border-[#3282ff] focus-within:ring-2 focus-within:ring-[#3282ff]/20">
                <label className="sr-only" htmlFor="bug-report-description">
                  Describe the problem, expected result, and steps to reproduce
                </label>
                <textarea
                  className="min-h-24 w-full resize-none font-medium tracking-tight field-sizing-content bg-transparent px-3 py-2.5 text-sm leading-5 text-[#111827] outline-none placeholder:text-[#98a2b3]"
                  id="bug-report-description"
                  maxLength={10000}
                  minLength={10}
                  onChange={(event) =>
                    setDescription(event.currentTarget.value)
                  }
                  placeholder="Describe the problem, what you expected, and steps to reproduce it."
                  required
                  value={description}
                />
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  multiple
                  onChange={handleImagesSelected}
                  ref={fileInputRef}
                  type="file"
                />
                <div className="flex min-h-9 items-center gap-1 border-t border-[#eaecf0] px-2">
                  <button
                    aria-label={`Attach images, ${images.length} of ${maxImageCount} selected`}
                    className="flex size-7 shrink-0 items-center justify-center rounded text-[#777a72] transition hover:bg-[#f1f2ee] hover:text-[#242620] focus-visible:outline-2 focus-visible:outline-[#858780] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={
                      images.length >= maxImageCount || submitting || recording
                    }
                    onClick={() => fileInputRef.current?.click()}
                    title={`Attach images (${images.length}/${maxImageCount})`}
                    type="button"
                  >
                    <Paperclip aria-hidden="true" className="size-4" />
                  </button>
                  {images.map((image) => (
                    <button
                      aria-expanded={previewImageId === image.id}
                      aria-label={`Preview ${image.file.name}`}
                      className={`size-7 shrink-0 overflow-hidden rounded border-2 p-0.5 transition focus-visible:outline-2 focus-visible:outline-[#858780] ${
                        previewImageId === image.id
                          ? "border-[#72756d] ring-1 ring-[#72756d]/20"
                          : "border-[#e5e5e3] hover:border-[#a0a19c]"
                      }`}
                      data-preview-thumb
                      key={image.id}
                      onClick={(event) =>
                        togglePreview(image.id, event.currentTarget)
                      }
                      type="button"
                    >
                      <Image
                        alt=""
                        className="size-full rounded-[2px] object-cover"
                        height={32}
                        src={image.url}
                        unoptimized
                        width={32}
                      />
                    </button>
                  ))}
                  <span className="flex-1" />
                  {recording ? (
                    <button
                      aria-label={`Stop voice note recording, ${minutes}:${seconds}`}
                      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-[#b44238] hover:bg-[#fff1f0]"
                      onClick={stopVoiceNote}
                      type="button"
                    >
                      <Square aria-hidden="true" className="size-3.5" />
                      <span>
                        {minutes}:{seconds}
                      </span>
                    </button>
                  ) : (
                    <button
                      aria-label="Record a voice note"
                      className="flex size-7 shrink-0 items-center justify-center rounded text-[#777a72] transition hover:bg-[#f1f2ee] hover:text-[#242620] focus-visible:outline-2 focus-visible:outline-[#858780] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={Boolean(voiceNote) || submitting}
                      onClick={startVoiceNote}
                      title="Record a voice note"
                      type="button"
                    >
                      <Mic aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </div>
                {voiceNote && (
                  <div className="border-t border-[#efefed] bg-[#fbfbfa] p-2">
                    <div className="flex flex-wrap items-center gap-2 rounded bg-white px-2 py-1">
                      <audio
                        aria-label="Recorded voice note preview"
                        className="h-8 min-w-0 flex-1"
                        controls
                        src={voiceNote.url}
                      />
                      <button
                        aria-label="Remove voice note"
                        className="flex size-6 shrink-0 items-center justify-center rounded text-[#777a72] hover:bg-[#f1f2ee]"
                        onClick={removeVoiceNote}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {images.map((image) =>
                previewImageId === image.id
                  ? createPortal(
                      <section
                        aria-label={`Preview ${image.file.name}`}
                        className="fixed z-[130] flex w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_30px_rgba(20,24,18,0.12)]"
                        key={`preview-${image.id}`}
                        ref={imagePreviewRef}
                        role="dialog"
                        style={{
                          left: previewPos.left,
                          bottom: previewPos.bottom,
                        }}
                        tabIndex={-1}
                      >
                        <div className="relative h-[190px] w-full">
                          <Image
                            alt={image.file.name}
                            className="object-contain object-center"
                            fill
                            sizes="320px"
                            src={image.url}
                            unoptimized
                          />
                        </div>

                        <footer className="flex w-full shrink-0 items-center gap-2 px-3.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="geist truncate text-left text-[11px] font-semibold leading-5 tracking-tight"
                              title={image.file.name}
                            >
                              {image.file.name}
                            </p>
                            <p className="geist text-left text-[11px] font-semibold uppercase leading-4 tracking-tight text-[#999]">
                              {image.file.type
                                .split("/")[1]
                                ?.split("+")[0]
                                ?.replace("jpeg", "jpg")}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center">
                            <a
                              aria-label={`Download ${image.file.name}`}
                              className="flex size-7 items-center justify-center rounded text-[#242620] hover:bg-[#eceee9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#555850]"
                              download={image.file.name}
                              href={image.url}
                              title="Download image"
                            >
                              <Download aria-hidden="true" className="size-4" />
                            </a>
                            <button
                              aria-label={`Remove ${image.file.name}`}
                              className="flex size-7 items-center justify-center rounded text-[#242620] hover:bg-[#eceee9] hover:text-[#b44238] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b44238]"
                              onClick={() => removeImage(image)}
                              title="Remove image"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </button>
                          </div>
                        </footer>
                      </section>,
                      document.body,
                    )
                  : null,
              )}
            </div>

            <section aria-labelledby="diagnostics-title">
             
              <label className="flex cursor-pointer items-start gap-3 rounded-md  px-3 py-3 font-medium tracking-tight">
                <input
                  checked={includeDiagnostics}
                  className="mt-0.5 size-4 shrink-0 accent-[#242620]"
                  onChange={(event) =>
                    setIncludeDiagnostics(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>
                  
                  <span className="font-semibold block text-xs leading-4 text-[#999]">
                   Include diagnostics. user agent, viewport, language, timezone, and page path will be sent with the report.
                  </span>
                </span>
              </label>
            </section>

            <section aria-label="Security verification" className="space-y-1">
              <div ref={turnstileContainerRef} />
              {!turnstileSiteKey ? (
                <p className="text-xs text-[#b44238]" role="alert">
                  Security verification is not configured. Bug reports are
                  temporarily unavailable.
                </p>
              ) : null}
              {turnstileError ? (
                <p className="text-xs text-[#777a72]" role="status">
                  {turnstileError}
                </p>
              ) : null}
            </section>

            {error && (
             
                <p
                          role="alert"
                          className="geist mb-1 rounded px-2 py-1  bg-[#fff1f0] text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
                        >
                          {error}
                        </p>
            )}

            <footer className="flex items-center justify-end gap-2 ">
              <button
                className="geist cursor-pointer rounded p-2 text-[13px] font-semibold leading-3 tracking-tight text-[#999] transition duration-300 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting || recording}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="geist cursor-pointer rounded bg-black p-2 text-[13px] font-semibold leading-3 tracking-tight text-white transition duration-300 hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  submitting ||
                  recording ||
                  description.trim().length < 10 ||
                  !turnstileSiteKey
                }
                type="submit"
              >
                {submitting ? "Sending..." : "Send"}
              </button>
            </footer>
          </form>
        )}
      </section>
      {turnstileSiteKey ? (
        <Script
          onError={() =>
            setTurnstileError("The security check could not load. Please try again.")
          }
          onReady={renderTurnstile}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      ) : null}
    </div>,
    document.body,
  );
}
