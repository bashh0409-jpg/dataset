"use client";

import {
  ArrowUp,
  Plus,
  Check,
  Copy,
  Download,
  LoaderCircle,
  MessageSquareText,
  Settings,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  getAiConversation,
  saveAiConversation,
  type AiConversationSummary,
} from "@/app/actions/ai-conversations";
import { generateWithAi } from "@/app/actions/generate-with-ai";
import {
  fieldTypes,
  generateRecords,
  generatorRequestSchema,
  type FieldType,
  recordsToCsv,
  type GeneratedRecord,
  type GeneratorRequest,
} from "@/lib/generator/engine";

type GeneratedDataset = {
  name: string;
  fields: GeneratorRequest["fields"];
  records: GeneratedRecord[];
  count: number;
  seed: number;
};

type DataView = "table" | "json" | "csv";
type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
type GeneratorMode = "agent" | "manual";
type GenerationPhase = "analyzing" | "generating" | "finalizing";
type ManualField = {
  id: number;
  name: string;
  type: FieldType;
  options: string;
};

const fieldLabels: Record<FieldType, string> = {
  uuid: "UUID",
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  email: "Email",
  company: "Company",
  product: "Product",
  integer: "Integer",
  price: "Price",
  boolean: "Boolean",
  date: "Date",
  phone: "Phone",
  city: "City",
  enum: "Enum",
};

const defaultManualFields: ManualField[] = [
  { id: 1, name: "id", type: "uuid", options: "" },
  { id: 2, name: "name", type: "fullName", options: "" },
  { id: 3, name: "email", type: "email", options: "" },
];

const examples = [
  "Generate 50 users with names, emails, and job titles",
  "Create products with names, prices, and categories",
];

type GeneratorPanelProps = {
  requestedConversationId: string | null;
  onConversationOpened: (id: string) => void;
  onChatSaved: (conversation: AiConversationSummary) => void;
};

export default function GeneratorPanel({
  requestedConversationId,
  onConversationOpened,
  onChatSaved,
}: GeneratorPanelProps) {
  const [mode, setMode] = useState<GeneratorMode>("agent");
  const [prompt, setPrompt] = useState("");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [manualName, setManualName] = useState("users");
  const [manualCount, setManualCount] = useState("25");
  const [manualFields, setManualFields] = useState(defaultManualFields);
  const [nextManualFieldId, setNextManualFieldId] = useState(4);
  const [dataset, setDataset] = useState<GeneratedDataset | null>(null);
  const [view, setView] = useState<DataView>("table");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] =
    useState<GenerationPhase>("analyzing");
  const [copied, setCopied] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(
    null,
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  const generatedCsv = dataset
    ? recordsToCsv(dataset.fields, dataset.records)
    : "";
  const generatedJson = dataset ? JSON.stringify(dataset.records, null, 2) : "";
  const formattedData =
    view === "json" ? generatedJson : view === "csv" ? generatedCsv : "";
  const canSubmitPrompt =
    prompt.trim().length >= (conversation.length > 0 ? 1 : 5);
  const maxPromptLength = Math.max(
    0,
    4_000 -
      conversation
        .slice(-7)
        .reduce((total, message) => total + message.content.length, 0),
  );

  const updateScrollToBottomVisibility = useCallback(() => {
    const container = conversationScrollRef.current;
    if (!container || conversation.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    const hasMoreBelow =
      container.scrollHeight - container.scrollTop - container.clientHeight > 8;
    setShowScrollToBottom(hasMoreBelow);
  }, [conversation.length]);

  useEffect(() => {
    const container = conversationScrollRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(updateScrollToBottomVisibility);
    resizeObserver.observe(container);
    const content = container.firstElementChild;
    if (content) {
      resizeObserver.observe(content);
    }
    updateScrollToBottomVisibility();

    return () => resizeObserver.disconnect();
  }, [conversation, updateScrollToBottomVisibility]);

  useEffect(() => {
    if (!requestedConversationId) return;
    let active = true;

    void getAiConversation(requestedConversationId)
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setSaveError(result.error);
          return;
        }
        setConversationId(result.data.id);
        setConversation(result.data.messages);
        setPrompt("");
        setDataset(null);
        setView("table");
        setError("");
        setSaveError("");
        onConversationOpened(result.data.id);
      })
      .catch(() => {
        if (active) {
          setSaveError("A network error occurred while opening the saved chat.");
        }
      });

    return () => {
      active = false;
    };
  }, [requestedConversationId, onConversationOpened]);

  const persistConversation = async (
    messages: ConversationMessage[],
    id: string | null,
  ) => {
    const result = await saveAiConversation({ id: id ?? undefined, messages });
    if ("error" in result) {
      setSaveError(result.error);
      return null;
    }

    setSaveError("");
    setConversationId(result.data.id);
    onChatSaved(result.data);
    return result.data.id;
  };

  const generateManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const randomSeed = new Uint32Array(1);
    globalThis.crypto.getRandomValues(randomSeed);
    const parsed = generatorRequestSchema.safeParse({
      name: manualName,
      count: manualCount === "" ? Number.NaN : Number(manualCount),
      seed: randomSeed[0] % 2_147_483_648,
      fields: manualFields.map((field) => ({
        name: field.name,
        type: field.type,
        ...(field.type === "enum"
          ? {
              options: field.options
                .split(",")
                .map((option) => option.trim())
                .filter(Boolean),
            }
          : {}),
      })),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the dataset settings.");
      return;
    }

    const request = parsed.data;
    setDataset({
      name: request.name,
      fields: request.fields,
      records: generateRecords(request),
      count: request.count,
      seed: request.seed,
    });
    setConversation([]);
    setConversationId(null);
    setView("table");
    setCopied(false);
  };

  const updateManualField = (
    id: number,
    update: Partial<Omit<ManualField, "id">>,
  ) => {
    setManualFields((current) =>
      current.map((field) =>
        field.id === id ? { ...field, ...update } : field,
      ),
    );
    setError("");
  };

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const userMessage = prompt.trim();
    if (!canSubmitPrompt || generating) return;

    const messages = [
      ...conversation,
      { role: "user" as const, content: userMessage },
    ];
    setConversation(messages);
    setPrompt("");
    setError("");
    setDataset(null);
    setGenerationPhase("analyzing");
    setGenerating(true);
    const phaseTimeout = window.setTimeout(
      () => setGenerationPhase("generating"),
      900,
    );

    try {
      const savedId = await persistConversation(messages, conversationId);
      const result = await generateWithAi({ messages: messages.slice(-8) });

      window.clearTimeout(phaseTimeout);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      setGenerationPhase("finalizing");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 300));

      if ("question" in result) {
        const nextMessages = [
          ...messages,
          { role: "assistant" as const, content: result.question },
        ];
        setConversation(nextMessages);
        await persistConversation(
          nextMessages,
          savedId ?? conversationId,
        );
        return;
      }

      setDataset(result.data);
      setView("table");
      setCopied(false);
      const nextMessages = [
        ...messages,
        {
          role: "assistant" as const,
          content: `Generated ${result.data.count} ${result.data.name} records. You can view or export them on the right.`,
        },
      ];
      setConversation(nextMessages);
      await persistConversation(nextMessages, savedId ?? conversationId);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      window.clearTimeout(phaseTimeout);
      setGenerating(false);
    }
  };

  const download = () => {
    if (!dataset || (view !== "json" && view !== "csv")) return;
    const isJson = view === "json";
    const contents = isJson ? generatedJson : generatedCsv;
    const mimeType = isJson ? "application/json" : "text/csv";
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${dataset.name}.${view}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyData = async () => {
    if (!formattedData) return;
    try {
      await navigator.clipboard.writeText(formattedData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy the data. Select and copy it manually.");
    }
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      window.setTimeout(() => setCopiedMessageIndex(null), 1600);
    } catch {
      setError("Couldn't copy the message. Please select and copy it manually.");
    }
  };

  const selectExample = (example: string) => {
    setPrompt(example);
    setError("");
  };

  return (
    <div className="flex h-full tracking-tight  min-h-0 flex-col bg-[#f9fbf7] pt-[36px] geist text-[13px] font-medium text-[#242620]">
      <header className="grid mt-5 shrink-0 grid-cols-2 items-center">
        <div className="flex h-full items-center ">
          <div
            className="flex h-full items-center"
            role="tablist"
            aria-label="Generation mode"
          >
            <button
              aria-selected={mode === "agent"}
              className={`flex h-full items-center gap-2 rounded-t-lg px-3 text-[14px] transition ${
                mode === "agent"
                  ? "bg-[#f1f5ef] font-medium text-[#20221e]"
                  : "text-[#777a72] hover:bg-[#f1f5ef]/60"
              }`}
              onClick={() => {
                setMode("agent");
                setError("");
              }}
              role="tab"
              type="button"
            >
              <MessageSquareText aria-hidden="true" className="size-[13px]" />
              Agent
            </button>
            <button
              aria-selected={mode === "manual"}
              className={`flex h-full items-center gap-2 rounded-t-lg px-3 text-[14px] transition ${
                mode === "manual"
                  ? "bg-[#f1f5ef] font-medium text-[#20221e]"
                  : "text-[#777a72] hover:bg-[#f1f5ef]/60"
              }`}
              onClick={() => {
                setMode("manual");
                setError("");
              }}
              role="tab"
              type="button"
            >
              <Settings aria-hidden="true" className="size-[13px]" />
              Manual
            </button>
          </div>
        </div>
        <div
          className="flex h-full items-center gap-1"
          role="tablist"
          aria-label="Generated data format"
        >
          {(["table", "json", "csv"] as const).map((format) => {
            return (
              <button
                aria-selected={view === format}
                className={`h-full flex items-center gap-1 rounded-t-lg px-2 cursor-pointer text-[12px] transition ${
                  view === format
                    ? "bg-white font-medium text-[#252721]"
                    : "font-medium text-[#666961] hover:bg-white/60 hover:text-[#252721]"
                }`}
                key={format}
                onClick={() => setView(format)}
                role="tab"
                type="button"
              >
                {format === "table" ? (
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    height="16px"
                    viewBox="48 -912 864 864"
                    width="16px"
                    fill="#999"
                  >
                    <path d="M216-144q-33 0-52.5-19.5T144-216v-528q0-33 19.5-52.5T216-816h528q33 0 52.5 19.5T816-744v528q0 33-19.5 52.5T744-144H216Zm228-228H216v156h228v-156Zm72 0v156h228v-156H516Zm-72-72v-156H216v156h228Zm72 0h228v-156H516v156ZM216-672h528v-72H216v72Z" />
                  </svg>
                ) : format === "csv" ? (
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    height="16px"
                    viewBox="48 -912 864 864"
                    width="16px"
                    fill="#999"
                  >
                    <path d="M288-384h72v-48h-72v-96h72v-48h-72q-20.4 0-34.2 13.8Q240-548.4 240-528v96q0 20.4 13.8 34.2Q267.6-384 288-384Zm120 0h96q10.2 0 17.1-6.9 6.9-6.9 6.9-17.1v-72q0-10-6.9-17t-17.1-7h-48v-24h72v-48h-96q-10.2 0-17.1 6.9-6.9 6.9-6.9 17.1v72q0 10 6.9 17t17.1 7h48v24h-72v48Zm208 0h48l56-192h-50l-30 103-30-103h-50l56 192ZM168-192q-29.7 0-50.85-21.16Q96-234.32 96-264.04v-432.24Q96-726 117.15-747T168-768h624q29.7 0 50.85 21.16Q864-725.68 864-695.96v432.24Q864-234 842.85-213T792-192H168Zm0-72h624v-432H168v432Zm0 0v-432 432Z" />
                  </svg>
                ) : (
                  <p>[ ]</p>
                )}
                {format === "table" ? "Table" : format.toUpperCase()}
              </button>
            );
          })}
          <span className="ml-auto flex items-center  gap-1">
            {dataset && (
              <span className="shrink-0  bg-white font-semibold uppercase rounded-t-lg text-[10px]  tracking-tight capitalize  text-[#696c64]">
                {dataset.count} rows
              </span>
            )}
            {view !== "table" && (
              <button
                aria-label={copied ? "Copied data" : "Copy data"}
                className="flex size-8  cursor-pointer items-center justify-center rounded-lg text-[#666961] transition hover:bg-white hover:text-[#252721] disabled:opacity-40"
                disabled={!dataset}
                onClick={copyData}
                title={copied ? "Copied" : "Copy"}
                type="button"
              >
                {copied ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
              </button>
            )}
            <button
              aria-label={`Download ${view} data`}
              className="flex size-8 items-center justify-center rounded-lg text-[#666961] transition hover:bg-white hover:text-[#252721] disabled:opacity-40"
              disabled={!dataset || view === "table"}
              onClick={download}
              title={`Download ${view.toUpperCase()}`}
              type="button"
            >
              <Download aria-hidden="true" className="size-4" />
            </button>
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        {mode === "agent" ? (
          <section
            aria-label="AI data prompt"
            className="flex min-h-[360px] min-w-0 flex-col bg-[#f1f5ef]"
          >
            {saveError && (
              <p
                className="mx-4 mt-3 text-[11px] leading-4 text-[#a64239]"
                role="alert"
              >
                {saveError}
              </p>
            )}
            <div
              className="flex-1 overflow-y-auto px-8 py-8 max-sm:px-4"
              onScroll={updateScrollToBottomVisibility}
              ref={conversationScrollRef}
            >
              {conversation.length > 0 ? (
                <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
                  {conversation.map((message, index) => (
                    <div
                      className={`group flex max-w-full items-start gap-1 ${
                        message.role === "user"
                          ? "ml-auto flex-row-reverse"
                          : "mr-auto"
                      }`}
                      key={`${index}-${message.role}`}
                    >
                      <div
                        className={`max-w-[min(88%,460px)] rounded-2xl border border-[#d1d5cd] px-2 py-1 text-[13px] leading-tight ${
                          message.role === "user"
                            ? "bg-gradient-to-r from-[#e7f2e4] to-[#f0ebf5] text-[#292c27]"
                            : "rounded border-none bg-transparent text-[#30332d]"
                        }`}
                      >
                        {message.content}
                      </div>
                      <button
                        aria-label={
                          copiedMessageIndex === index
                            ? "Message copied"
                            : `Copy ${message.role} message`
                        }
                        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-[#858880] transition hover:bg-white/70 hover:text-[#252721] focus-visible:outline-2 focus-visible:outline-[#858880] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        onClick={() => void copyMessage(message.content, index)}
                        title={
                          copiedMessageIndex === index
                            ? "Copied"
                            : "Copy message"
                        }
                        type="button"
                      >
                        {copiedMessageIndex === index ? (
                          <Check aria-hidden="true" className="size-3.5" />
                        ) : (
                          <Copy aria-hidden="true" className="size-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                  {generating && (
                    <div
                      aria-live="polite"
                      className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-sm px-4 py-3 text-[12px] text-[#696c64]"
                    >
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-3.5 animate-spin"
                      />
                      <span>
                        {generationPhase === "analyzing" &&
                          "Analyzing request…"}
                        {generationPhase === "generating" &&
                          "Generating dataset…"}
                        {generationPhase === "finalizing" &&
                          "Finalizing results…"}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mx-auto h-full justify-center items-center flex flex-col mt-[min(10vh,90px)] max-w-[400px] text-center">
                  <p className="geist hidde text-center mx-auto max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
                    Describe the records and fields, or paste a JSON,
                    TypeScript, SQL, or Prisma schema. Pasted code is read as
                    data structure and never executed.
                  </p>

                  <div className="mt-5 hidden flex-col gap-1">
                    {examples.map((example) => (
                      <button
                        className="w-full px-3 py-2 text-left text-[12px] text-[#62655e] transition-colors hover:bg-black/[0.03] hover:text-[#252721]"
                        key={example}
                        onClick={() => selectExample(example)}
                        type="button"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <p
                  className="mt-4 rounded border border-[#efd8d4] bg-[#fff9f8] px-3 py-0.5 tracking-tight text-[12px] leading-5 text-[#a64239]"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>

            <form className="shrink-0 p-4 max-sm:p-3" onSubmit={generate}>
              <div className="max-w-120 justify-between flex w-full mx-auto p-1">
                <div className="flex hidden px-1 gap-1  bg-white h-8 min-w-8 rounded-full justify-center cursor-pointer flex w- items-center  text-[12px] text-[#696c64] hover:text-[#30332d]">
                  <button
                    className=" w-6 h-6 flex items-center justify-center rounded-full cursor-pointer text-[#20221e]"
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="48 -912 864 864"
                      width="18px"
                      fill="#999"
                      className="rotate-[45deg]"
                    >
                      <path d="M600-504v-216h72v216h-72ZM432-243q-32-8-52-35t-20-62v-380h72v477Zm24 147q-91 0-153.5-65.5T240-319v-389q0-65 45.5-110.5T396-864q66 0 111 48t45 115v305h-72v-312q0-35-24.5-59.5T396-792q-35 0-59.5 25.5T312-706v394q0 60 42 101.5T456-168q32 1 60-13t48-37v93q-24 14-51.5 21.5T456-96Zm180-48v-108H528v-72h108v-108h72v108h108v72H708v108h-72Z" />
                    </svg>
                  </button>
                </div>
                <div className="flex px-1 gap-1  bg-white h-8 min-w-8 rounded-full justify-center cursor-pointer flex w- items-center  text-[12px] text-[#696c64] ">
                  <button
                    className=" w-6 h-6 flex items-center justify-center rounded-full cursor-pointer  text-[#20221e]"
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="48 -912 864 864"
                      width="18px"
                      fill="#999"
                    >
                      <path d="M288-600v-72h528v72H288Zm0 156v-72h528v72H288Zm0 156v-72h528v72H288ZM180-600q-14 0-25-11t-11-25.5q0-14.5 11-25t25.5-10.5q14.5 0 25 10.35T216-636q0 14-10.35 25T180-600Zm0 156q-14 0-25-11t-11-25.5q0-14.5 11-25t25.5-10.5q14.5 0 25 10.35T216-480q0 14-10.35 25T180-444Zm0 156q-14 0-25-11t-11-25.5q0-14.5 11-25t25.5-10.5q14.5 0 25 10.35T216-324q0 14-10.35 25T180-288Z" />
                    </svg>
                  </button>
                  {showScrollToBottom && (
                    <>
                      <span className="w-px h-3 bg-black/10" />
                      <button
                        aria-label="Scroll to latest message"
                        className=" w-6 h-6 flex items-center justify-center rounded-full cursor-pointer text-[#20221e] "
                        onClick={() =>
                          conversationScrollRef.current?.scrollTo({
                            top: conversationScrollRef.current.scrollHeight,
                            behavior: "smooth",
                          })
                        }
                        type="button"
                        title="Scroll to latest message"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          height="18px"
                          viewBox="48 -912 864 864"
                          width="18px"
                          fill="#999"
                        >
                          <path d="M444-768v438L243-531l-51 51 288 288 288-288-51-51-201 201v-438h-72Z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <label className="sr-only hidden" htmlFor="dataset-prompt">
                Describe the data to generate
              </label>
              <div className="flex items-end gap-2 mx-auto max-w-120 rounded-2xl border border-[#d7dbd4] bg-white p-3 transition focus-within:border-[#aeb3a9]">
                <textarea
                  className="max-h-32 min-h-[70px] min-w-0 flex-1 resize-none field-sizing-content bg-transparent px-1 py-1 text-[14px] leading-[1.5] font-medium outline-none placeholder:text-[#858880]"
                  disabled={generating}
                  id="dataset-prompt"
                  maxLength={maxPromptLength}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  placeholder="Describe the data or paste a schema or code snippet..."
                  required
                  value={prompt}
                />
                <button
                  aria-label="Attach a file (not implemented)"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white cursor-pointer text-white transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                 
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="48 -912 864 864"
                    width="18px"
                    fill="#999"
                    className="rotate-[45deg]"
                  >
                    <path d="M600-504v-216h72v216h-72ZM432-243q-32-8-52-35t-20-62v-380h72v477Zm24 147q-91 0-153.5-65.5T240-319v-389q0-65 45.5-110.5T396-864q66 0 111 48t45 115v305h-72v-312q0-35-24.5-59.5T396-792q-35 0-59.5 25.5T312-706v394q0 60 42 101.5T456-168q32 1 60-13t48-37v93q-24 14-51.5 21.5T456-96Zm180-48v-108H528v-72h108v-108h72v108h108v72H708v108h-72Z" />
                  </svg>
                </button>
                <button
                  aria-label={generating ? "Generating data" : "Generate data"}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#252721] text-white transition hover:bg-[#41433c] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={generating || !canSubmitPrompt}
                  type="submit"
                >
                  {generating ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <ArrowUp aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 flex hidden justify-between text-[10px] font-medium text-[#999]">
                <span>{generating ? "Generating…" : "Qwen3.7 Plus"}</span>
              </p>
            </form>
          </section>
        ) : (
          <section
            aria-label="Manual data configuration"
            className="flex min-h-[360px] min-w-0 flex-col bg-[#f1f5ef]"
          >
            <form
              className="flex-1 overflow-y-auto px-6 py-6 max-sm:px-4"
              onSubmit={generateManual}
            >
              <div className="mx-auto w-full max-w-[480px]">
                <p className="geist max-w-xs text-sm font-medium leading-4 tracking-tight text-[#999]">
                  Choose fields and record count. Generation runs locally
                  without using AI.
                </p>

                <div className="mt-5 grid grid-cols-[minmax(0,1fr)_100px] gap-3">
                  <label className="block">
                    <p className="geist mb-1  max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                      Dataset name
                    </p>
                    <input
                      className="h-7 w-full rounded bg-white px-3 text-[12px] outline-none focus:ring-2 focus:ring-[#d9ded5]"
                      maxLength={80}
                      onChange={(event) =>
                        setManualName(event.currentTarget.value)
                      }
                      value={manualName}
                    />
                  </label>
                  <label className="block">
                    <p className="geist mb-1  max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                      Records
                    </p>
                    <input
                      className="h-7 w-full rounded bg-white px-3 text-[12px] outline-none focus:ring-2 focus:ring-[#d9ded5]"
                      max={500}
                      min={1}
                      onChange={(event) =>
                        setManualCount(event.currentTarget.value)
                      }
                      type="number"
                      value={manualCount}
                    />
                  </label>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <p className="geist mb-1  max-w-xs text-xs font-medium leading-4 tracking-tight text-[#999]">
                    Fields
                  </p>
                  <button
                    className="flex items-center gap-1 rounded px-2  text-[11px] font-medium text-[#55584f] transition hover:bg-white/70 disabled:opacity-40"
                    disabled={manualFields.length >= 25}
                    onClick={() => {
                      const id = nextManualFieldId;
                      setManualFields((current) => [
                        ...current,
                        {
                          id,
                          name: `field_${id}`,
                          type: "fullName",
                          options: "",
                        },
                      ]);
                      setNextManualFieldId((current) => current + 1);
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    Add field
                  </button>
                </div>

                <div className="mt-2 divide-y divide-[#e2e8df]">
                  {manualFields.map((field) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.8fr)_28px] gap-2 py-2"
                      key={field.id}
                    >
                      <input
                        aria-label={`Field name ${field.id}`}
                        className="h-7 min-w-0 rounded bg-white px-2.5 text-[11px] outline-none focus:ring-2 focus:ring-[#d9ded5]"
                        maxLength={40}
                        onChange={(event) =>
                          updateManualField(field.id, {
                            name: event.currentTarget.value,
                          })
                        }
                        placeholder="Field name"
                        value={field.name}
                      />
                      <select
                        aria-label={`Field type ${field.name}`}
                        className="h-7 min-w-0 rounded bg-white px-2.5 text-[11px] outline-none focus:ring-2 focus:ring-[#d9ded5]"
                        onChange={(event) =>
                          updateManualField(field.id, {
                            type: event.currentTarget.value as FieldType,
                          })
                        }
                        value={field.type}
                      >
                        {fieldTypes.map((type) => (
                          <option key={type} value={type}>
                            {fieldLabels[type]}
                          </option>
                        ))}
                      </select>
                      <button
                        aria-label={`Remove ${field.name || "field"}`}
                        className="flex size-8 items-center justify-center rounded-lg text-[#8a8d85] transition hover:bg-white hover:text-[#a64239] disabled:opacity-30"
                        disabled={manualFields.length <= 1}
                        onClick={() =>
                          setManualFields((current) =>
                            current.filter((item) => item.id !== field.id),
                          )
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                      {field.type === "enum" && (
                        <input
                          aria-label={`Enum options for ${field.name}`}
                          className="col-span-2 h-8 rounded-lg bg-white px-2.5 text-[10px] outline-none focus:ring-2 focus:ring-[#d9ded5]"
                          onChange={(event) =>
                            updateManualField(field.id, {
                              options: event.currentTarget.value,
                            })
                          }
                          placeholder="Options separated by commas"
                          value={field.options}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {error && (
                  <p
                    className="mt-3 text-[11px] leading-4 text-[#a64239]"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <button
                  className="mt-5 p-1 rounded bg-[#252721] px-2 text-[11px] font-semibold text-white transition hover:bg-[#41433c]"
                  type="submit"
                >
                  Generate data
                </button>
              </div>
            </form>
          </section>
        )}

        <section
          aria-label="Generated data"
          className="flex min-h-[360px] min-w-0 flex-col bg-white"
        >
          <div className="min-h-0 flex-1 overflow-auto">
            {!dataset ? (
              <div className="flex h-full min-h-[300px] items-center justify-center px-6 text-center">
                <p className="max-w-[260px] text-[xs leading-tight font-medium text-[#777a72]">
                  Your generated data will appear here.
                </p>
              </div>
            ) : view === "table" ? (
              <table className="min-w-full border-separate border-spacing-0 text-left text-[12px]">
                <thead className="sticky top-0 bg-[#fbfcf9] text-[#858780]">
                  <tr>
                    <th className="border-b border-[#e5e8e2] px-4 py-3 font-medium">
                      #
                    </th>
                    {dataset.fields.map((field) => (
                      <th
                        className="whitespace-nowrap border-b border-[#e5e8e2] px-4 py-3 font-medium text-[#555850]"
                        key={field.name}
                      >
                        {field.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataset.records.map((record, index) => (
                    <tr className="text-[#4e5049]" key={index}>
                      <td className="border-b border-[#eff0ec] px-4 py-3 text-[#777a72]">
                        {index + 1}
                      </td>
                      {dataset.fields.map((field) => (
                        <td
                          className="max-w-56 truncate border-b border-[#eff0ec] px-4 py-3 font-normal text-[#41433d]"
                          key={field.name}
                          title={String(record[field.name])}
                        >
                          {String(record[field.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-[1.7] text-[#41433d]">
                {formattedData}
              </pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
