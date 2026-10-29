"use client";

import Image from "next/image";
import Script from "next/script";
import {
  Download,
  Mic,
  Paperclip,
  Square,
  Trash2,
} from "lucide-react";
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
const maxImageSize = 3 * 1024 * 1024;
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

async function createAudioWaveform(blob: Blob, barCount: number) {
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(
      await blob.arrayBuffer(),
    );
    const peaks = Array.from({ length: barCount }, (_, barIndex) => {
      const start = Math.floor((barIndex * audioBuffer.length) / barCount);
      const end = Math.max(
        start + 1,
        Math.floor(((barIndex + 1) * audioBuffer.length) / barCount),
      );
      let peak = 0;

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const samples = audioBuffer.getChannelData(channel);
        for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
          peak = Math.max(peak, Math.abs(samples[sampleIndex]));
        }
      }

      return peak;
    });
    const maximumPeak = Math.max(...peaks, 0.001);
    return peaks.map((peak) => Math.max(3, (peak / maximumPeak) * 40));
  } finally {
    await audioContext.close();
  }
}

export default function BugReportDialog({ onClose }: BugReportDialogProps) {
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [previewVoiceNote, setPreviewVoiceNote] = useState(false);
  const [previewPos, setPreviewPos] = useState({ left: 16, bottom: 16 });
  const [voiceNote, setVoiceNote] = useState<VoiceNote | null>(null);
  const [voiceNotePlaying, setVoiceNotePlaying] = useState(false);
  const [voiceNoteWaveform, setVoiceNoteWaveform] = useState<number[]>([]);
  const [voiceNoteProgress, setVoiceNoteProgress] = useState(0);
  const voiceNoteAudioRef = useRef<HTMLAudioElement>(null);
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
  const submitReportRef = useRef<((token: string) => Promise<void>) | null>(
    null,
  );
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
          execution: "execute",
          callback: (token) => {
            setTurnstileError("");
            if (turnstilePendingRef.current) {
              turnstilePendingRef.current = false;
              const submit = submitReportRef.current;
              if (submit) void submit(token);
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
      console.error(
        "Unable to render the bug report Turnstile widget.",
        renderError,
      );
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
      if (event.key === "Escape" && (previewImageId || previewVoiceNote)) {
        event.stopPropagation();
        setPreviewImageId(null);
        setPreviewVoiceNote(false);
        return;
      }
      if (event.key === "Escape" && !submitting && !recording) onClose();
    };

    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose, previewImageId, previewVoiceNote, recording, submitting]);

  useEffect(() => {
    if (!previewImageId && !previewVoiceNote) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        imagePreviewRef.current?.contains(target) ||
        target.closest("[data-preview-thumb]")
      ) {
        return;
      }
      setPreviewImageId(null);
      setPreviewVoiceNote(false);
    };
    // The stored position goes stale on resize, so just close the preview.
    const close = () => setPreviewImageId(null);

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", close);
    };
  }, [previewImageId, previewVoiceNote]);

  // Move focus into the preview when it opens.
  useEffect(() => {
    if (previewImageId || previewVoiceNote) imagePreviewRef.current?.focus();
  }, [previewImageId, previewVoiceNote]);

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
      setError("Images must be JPG, PNG, WebP, or GIF files up to 3 MB each.");
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
    setPreviewVoiceNote(false);
    const rect = thumb.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    setPreviewPos({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      bottom: window.innerHeight - rect.top + 10, // 10px gap above the thumbnail
    });
    setPreviewImageId(id);
  };

  const toggleVoiceNotePreview = (thumb: HTMLElement) => {
    if (previewVoiceNote) {
      setPreviewVoiceNote(false);
      return;
    }

    setPreviewImageId(null);
    const rect = thumb.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    setPreviewPos({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      bottom: window.innerHeight - rect.top + 10,
    });
    setPreviewVoiceNote(true);
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
          if (mountedRef.current) {
            setVoiceNote({ file, url });
            setVoiceNoteWaveform([]);
            setVoiceNoteProgress(0);
            void createAudioWaveform(blob, 64)
              .then((waveform) => {
                if (mountedRef.current && voiceNoteUrlRef.current === url) {
                  setVoiceNoteWaveform(waveform);
                }
              })
              .catch((waveformError: unknown) => {
                console.error(
                  "Unable to analyze the recorded voice note waveform.",
                  waveformError,
                );
                if (mountedRef.current && voiceNoteUrlRef.current === url) {
                  setError(
                    "The voice note was recorded, but its waveform preview could not be generated.",
                  );
                }
              });
          } else {
            URL.revokeObjectURL(url);
          }
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
    voiceNoteAudioRef.current?.pause();
    if (voiceNote?.url) URL.revokeObjectURL(voiceNote.url);
    voiceNoteUrlRef.current = null;
    setVoiceNote(null);
    setVoiceNotePlaying(false);
    setVoiceNoteWaveform([]);
    setVoiceNoteProgress(0);
    setPreviewVoiceNote(false);
  };

  const toggleVoiceNotePlayback = async () => {
    const audio = voiceNoteAudioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError("Unable to play the voice note. Please try again.");
      }
    } else {
      audio.pause();
    }
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
            console.error(
              "Bug report attachment upload failed:",
              JSON.stringify({
                status: uploadError.status ?? null,
                statusCode: uploadError.statusCode ?? null,
                message: uploadError.message || String(uploadError),
                fileType: file.type,
                fileSize: file.size,
              }),
            );

          if (uploadError.status === 403) {
            throw new Error(
              "Storage denied the upload. Check that the bug-report attachment Storage policies have been applied.",
            );
          }
          if (uploadError.status === 404) {
            throw new Error(
              "The bug-report attachment bucket is missing. Apply the attachment Storage migrations, then try again.",
            );
          }
          if (uploadError.status === 413) {
            throw new Error(
              "This attachment exceeds the Storage file-size limit.",
            );
          }
          if (uploadError.status === 400) {
            throw new Error(
              "Supabase rejected the attachment (400). Check the browser console for the Storage error details and confirm the latest bug-report attachment migrations are applied.",
            );
          }
          throw new Error(
            "Unable to upload an attachment. Check the browser console for the Storage error details, then try again.",
          );
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

  useEffect(() => {
    submitReportRef.current = submitReport;
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setTurnstileError("");
    if (
      !turnstileSiteKey ||
      !window.turnstile ||
      !turnstileWidgetIdRef.current
    ) {
      setTurnstileError(
        !turnstileSiteKey
          ? "Turnstile is not configured for this deployment."
          : !window.turnstile
            ? "Turnstile did not load. Check your connection or browser content blockers, then reload."
            : "Turnstile could not initialize for this hostname. Check the Cloudflare widget hostname and site key, then reload.",
      );
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
        <header className="mb-2 flex items-start justify-between gap-4">
          <div>
            <p className="geist hidden mt-1 text-sm font-medium leading-4 tracking-tight text-[#999]">
              {submitted
                ? "Your report was sent."
                : "Tell us what happened in your workspace."}
            </p>
          </div>
        </header>

        {submitted ? (
          <div className=" ">
            <p
              role="status"
              className="geist mb-1 rounded  py-1 text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
            >
              Thanks for helping us improve Synthetic. We&rsquo;ll review your
              report and follow up as soon as we have updates. If we need more
              information, we&rsquo;ll reach out.
            </p>

            <button
              className="geist rounded bg-black px-3 py-1 mt-2 text-sm font-medium text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-[#3282ff]"
              type="button"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="relative" ref={attachmentComposerRef}>
              <div className="overflow-hidden rounded-md  bg-black/5 focus-within:border-[#3282ff] focus-within:ring-2 focus-within:ring-[#3282ff]/20">
                <textarea
                  className="max-h-32 min-h-[100px]  w-full min-w-0 flex-1 resize-none field-sizing-content  p-2 text-[14px] leading-tight tracking-tight font-medium outline-none placeholder:text-[#858880]"
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
                <div className="flex min-h-9 items-center gap-1 px-2">
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
                  {voiceNote && (
                    <button
                      aria-expanded={previewVoiceNote}
                      aria-label="Preview recorded voice note"
                      className={`flex size-7 shrink-0 items-center justify-center rounded border-2 transition focus-visible:outline-2 focus-visible:outline-[#858780] ${
                        previewVoiceNote
                          ? "border-[#72756d] bg-[#f1f2ee] text-[#242620] ring-1 ring-[#72756d]/20"
                          : "border-[#e5e5e3] text-[#777a72] hover:border-[#a0a19c] hover:bg-[#f1f2ee]"
                      }`}
                      data-preview-thumb
                      onClick={(event) =>
                        toggleVoiceNotePreview(event.currentTarget)
                      }
                      type="button"
                    >
                      <Mic aria-hidden="true" className="size-4" />
                    </button>
                  )}
                  <span className="flex-1" />
                  {recording ? (
                    <div className="flex h-7 items-center gap-2 rounded bg-[#fff1f0] py-1 pl-2.5 pr-1">
                      <span className="relative flex size-2" aria-hidden="true">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#b44238]/50 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-2 rounded-full bg-[#b44238]" />
                      </span>

                      <span className="geist min-w-[2.25rem] text-xs font-medium leading-4 tracking-tight text-[#b44238] tabular-nums">
                        {minutes}:{seconds}
                      </span>

                      <button
                        aria-label={`Stop voice note recording, ${minutes}:${seconds}`}
                        className="flex size-5 shrink-0 items-center justify-center rounded bg-[#b44238] text-white transition hover:bg-[#9a362e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b44238]"
                        onClick={stopVoiceNote}
                        title="Stop recording"
                        type="button"
                      >
                        <Square
                          aria-hidden="true"
                          className="size-2.5 fill-current"
                        />
                      </button>
                    </div>
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
              {voiceNote && previewVoiceNote
                ? createPortal(
                    <section
                      aria-label="Voice note preview"
                      className="fixed z-[130] flex w-[min(260px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_30px_rgba(20,24,18,0.12)]"
                      ref={imagePreviewRef}
                      role="dialog"
                      style={{
                        left: previewPos.left,
                        bottom: previewPos.bottom,
                      }}
                      tabIndex={-1}
                    >
                      <button
                        aria-label={
                          voiceNotePlaying
                            ? "Pause voice note"
                            : "Play voice note"
                        }
                        className="relative flex h-18 w-full items-center justify-center overflow-hidden bg-[#f1f2ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#555850]"
                        onClick={() => void toggleVoiceNotePlayback()}
                        type="button"
                      >
                        <span className="relative flex h-full w-full items-center justify-center gap-px">
                          {voiceNoteWaveform.map((height, index) => (
                            <span
                              className={`voice-note-waveform-bar ${
                                index / voiceNoteWaveform.length <
                                voiceNoteProgress
                                  ? "is-played"
                                  : ""
                              }`}
                              key={index}
                              style={{ height: `${height}px` }}
                            />
                          ))}
                          <span
                            aria-hidden="true"
                            className="voice-note-waveform-playhead"
                            style={{ left: `${voiceNoteProgress * 100}%` }}
                          />
                        </span>
                      </button>
                      <audio
                        aria-label="Recorded voice note preview"
                        className="hidden"
                        onEnded={() => {
                          setVoiceNotePlaying(false);
                        }}
                        onPause={() => {
                          setVoiceNotePlaying(false);
                        }}
                        onPlay={() => setVoiceNotePlaying(true)}
                        onTimeUpdate={(event) => {
                          const audio = event.currentTarget;
                          setVoiceNoteProgress(
                            audio.duration
                              ? audio.currentTime / audio.duration
                              : 0,
                          );
                        }}
                        preload="auto"
                        ref={voiceNoteAudioRef}
                        src={voiceNote.url}
                      />
                      <footer className="flex w-full shrink-0 items-center gap-2 px-3.5 ">
                        <div className="min-w-0 flex-1">
                          <p
                            className="geist truncate text-left text-[11px] font-semibold leading-5 tracking-tight"
                            title={voiceNote.file.name}
                          >
                            {voiceNote.file.name}
                          </p>
                          <p className="geist text-left text-[11px] font-semibold uppercase leading-4 tracking-tight text-[#999]">
                            {voiceNote.file.type
                              .split("/")[1]
                              ?.split("+")[0] ?? "audio"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <a
                            aria-label="Download voice note"
                            className="flex size-7 items-center justify-center rounded text-[#242620] hover:bg-[#eceee9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#555850]"
                            download={voiceNote.file.name}
                            href={voiceNote.url}
                            title="Download voice note"
                          >
                            <Download aria-hidden="true" className="size-4" />
                          </a>
                          <button
                            aria-label="Remove voice note"
                            className="flex size-7 items-center justify-center rounded text-[#242620] hover:bg-[#eceee9] hover:text-[#b44238] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b44238]"
                            onClick={removeVoiceNote}
                            title="Remove voice note"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </button>
                        </div>
                      </footer>
                    </section>,
                    document.body,
                  )
                : null}
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

                <p
                  role="alert"
                  className="geist rounded  text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
                >
                  Include diagnostics. user agent, viewport, language, timezone,
                  and page path will be sent with the report.
                </p>
              </label>
            </section>

            <section
              aria-label="Security verification"
              className="relative space-y-1"
            >
              <div className="absolute h-0 w-0" ref={turnstileContainerRef} />
              {!turnstileSiteKey ? (
                <p className="text-xs text-[#b44238]" role="alert">
                  Security verification is not configured. Bug reports are
                  temporarily unavailable.
                </p>
              ) : null}
              {turnstileError ? (
                <p
                  role="alert"
                  className="geist mb-1 rounded bg-[#fff1f0] px-2 py-1 text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
                >
                  {turnstileError}
                </p>
              ) : null}
            </section>

            {error && (
              <p
                role="alert"
                className="geist mb-1 rounded bg-[#fff1f0] px-2 py-1 text-left text-sm font-medium leading-4 tracking-tight text-[#999]"
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
            setTurnstileError(
              "The security check could not load. Please try again.",
            )
          }
          onLoad={() => {
            window.requestAnimationFrame(renderTurnstile);
          }}
          onReady={() => {
            window.requestAnimationFrame(renderTurnstile);
          }}
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      ) : null}
    </div>,
    document.body,
  );
}
