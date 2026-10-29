"use client";

import {
  ArrowUp,
  Boxes,
  FileText,
  Plus,
  Check,
  Copy,
  Download,
  LoaderCircle,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Trash2,
  Table2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  getAiConversation,
  saveAiGeneratedArtifact,
  saveAiConversation,
  type AiGeneratedArtifact,
  type AiConversationSummary,
} from "@/app/actions/ai-conversations";
import { generateWithAi } from "@/app/actions/generate-with-ai";
import { includeTextAttachmentsInMessages } from "@/lib/generator/sql-schema";
import {
  fieldTypes,
  generateRecords,
  generatorRequestSchema,
  type FieldType,
  recordsToCsv,
  type GeneratedTable,
} from "@/lib/generator/engine";
import { createZipBlob } from "@/lib/generator/zip";

type GeneratedDataset = {
  name: string;
  fields: GeneratedTable["fields"];
  records: GeneratedTable["records"];
  count: number;
  seed: number;
};

type DataView = "table" | "json" | "csv" | "schema";
type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachmentName?: string;
  attachmentSizeBytes?: number;
  attachmentContents?: string;
  generatedArtifactId?: string;
  generatedArtifactIds?: string[];
  modelUsed?: string;
};
type TextAttachment = {
  name: string;
  contents: string;
  size: number;
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
  idNumber: "Synthetic ID number",
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
  address: "Address",
  text: "Text",
  enum: "Enum",
};

const defaultManualFields: ManualField[] = [
  { id: 1, name: "id", type: "uuid", options: "" },
  { id: 2, name: "name", type: "fullName", options: "" },
  { id: 3, name: "email", type: "email", options: "" },
];

const examples = [
  "Generate 3 customers with a UUID, full name, email, and phone number",
  "Create 3 products with a name, price, and category",
  "Generate 3 users and 3 orders linked by user ID",
];
const maxTextAttachmentBytes = 64_000;
const maxFreeTextAttachmentCharacters = 20_000;

type GeneratorPanelProps = {
  workspaceId: string;
  isPro: boolean;
  model: "qwen" | "auto" | "claude" | "openai";
  requestedConversationId: string | null;
  onWorkspaceCreditsChanged: () => void;
  onConversationOpened: (id: string) => void;
  onChatSaved: (conversation: AiConversationSummary) => void;
};

export default function GeneratorPanel({
  workspaceId,
  isPro,
  model,
  requestedConversationId,
  onWorkspaceCreditsChanged,
  onConversationOpened,
  onChatSaved,
}: GeneratorPanelProps) {
  const [mode, setMode] = useState<GeneratorMode>("agent");
  const [prompt, setPrompt] = useState("");
  const [textAttachment, setTextAttachment] = useState<TextAttachment | null>(
    null,
  );
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [manualName, setManualName] = useState("users");
  const [manualCount, setManualCount] = useState("25");
  const [manualFields, setManualFields] = useState(defaultManualFields);
  const [nextManualFieldId, setNextManualFieldId] = useState(4);
  const [dataset, setDataset] = useState<GeneratedDataset | null>(null);
  const [generatedTables, setGeneratedTables] = useState<GeneratedDataset[]>([]);
  const [artifacts, setArtifacts] = useState<AiGeneratedArtifact[]>([]);
  const [exampleFlyoutOpen, setExampleFlyoutOpen] = useState(false);
  const [previewAttachmentIndex, setPreviewAttachmentIndex] = useState<
    number | null
  >(null);
  const [messageAttachmentFlyoutPosition, setMessageAttachmentFlyoutPosition] =
    useState({ left: 16, bottom: 16 });
  const [composerAttachmentFlyoutOpen, setComposerAttachmentFlyoutOpen] =
    useState(false);
  const [view, setView] = useState<DataView>("table");
  const [showDataPanel, setShowDataPanel] = useState(true);
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
  const pendingConversationScrollRef = useRef<ScrollBehavior | null>(null);
  const exampleFlyoutRef = useRef<HTMLDivElement>(null);
  const attachmentFlyoutRef = useRef<HTMLDivElement>(null);
  const messageAttachmentButtonRef = useRef<HTMLButtonElement>(null);
  const composerAttachmentFlyoutRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const dataScrollRef = useRef<HTMLDivElement>(null);
  const dataScrollAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const dataScrollIdleTimerRef = useRef<number | null>(null);
  const schemaCanvasViewportRef = useRef<HTMLDivElement>(null);
  const schemaPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const schemaTableDragRef = useRef<{
    pointerId: number;
    tableName: string;
    startX: number;
    startY: number;
    position: { x: number; y: number };
  } | null>(null);
  const [draggingSchemaTable, setDraggingSchemaTable] = useState<string | null>(
    null,
  );
  const [schemaTablePositions, setSchemaTablePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [isSchemaPanning, setIsSchemaPanning] = useState(false);
  const schemaDiagramRef = useRef<HTMLDivElement>(null);
  const [schemaZoom, setSchemaZoom] = useState(1);
  const [schemaRelationshipStyle, setSchemaRelationshipStyle] = useState<
    "elbow" | "straight" | "bezier"
  >("elbow");
  const [schemaRelationshipPaths, setSchemaRelationshipPaths] = useState<
    {
      key: string;
      sourceTable: string;
      targetTable: string;
      target: string;
      path: string;
      start: { x: number; y: number };
      end: { x: number; y: number };
      label: string;
      labelX: number;
      labelY: number;
      labelAngle: number;
    }[]
  >([]);
  const [schemaDiagramSize, setSchemaDiagramSize] = useState({
    width: 0,
    height: 0,
  });

  const generatedCsv = dataset
    ? recordsToCsv(dataset.fields, dataset.records)
    : "";
  const generatedJson = dataset ? JSON.stringify(dataset.records, null, 2) : "";
  const formattedData =
    view === "json" ? generatedJson : view === "csv" ? generatedCsv : "";
  const canSubmitPrompt =
    prompt.trim().length >= (conversation.length > 0 ? 1 : 5) ||
    textAttachment !== null;
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
    const behavior = pendingConversationScrollRef.current;
    const container = conversationScrollRef.current;
    if (!behavior || !container) return;

    pendingConversationScrollRef.current = null;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, [conversation]);

  useEffect(() => {
    const diagram = schemaDiagramRef.current;
    if (!diagram || view !== "schema") return;

    const updateRelationships = () => {
      const bounds = diagram.getBoundingClientRect();
      const viewport = schemaCanvasViewportRef.current;
      const canvasX = (x: number) => (x - bounds.left) / schemaZoom;
      const canvasY = (y: number) => (y - bounds.top) / schemaZoom;
      const width = Math.max(
        diagram.scrollWidth,
        diagram.clientWidth,
        (viewport?.clientWidth ?? 0) / schemaZoom,
        ...Array.from(
          diagram.querySelectorAll<HTMLElement>("[data-schema-table]"),
          (card) => canvasX(card.getBoundingClientRect().right) + 32,
        ),
      );
      const height = Math.max(
        diagram.scrollHeight,
        diagram.clientHeight,
        (viewport?.clientHeight ?? 0) / schemaZoom,
        ...Array.from(
          diagram.querySelectorAll<HTMLElement>("[data-schema-table]"),
          (card) => canvasY(card.getBoundingClientRect().bottom) + 32,
        ),
      );
      const tableBounds = generatedTables.flatMap((table) => {
        const card = diagram.querySelector<HTMLElement>(
          `[data-schema-table="${table.name}"]`,
        );
        if (!card) return [];
        const cardBounds = card.getBoundingClientRect();
        return [
          {
            name: table.name,
            left: canvasX(cardBounds.left),
            right: canvasX(cardBounds.right),
            top: canvasY(cardBounds.top),
            bottom: canvasY(cardBounds.bottom),
          },
        ];
      });
      const getPolylineLabelPosition = (
        points: { x: number; y: number }[],
      ) => {
        const segmentLengths = points.slice(1).map((point, index) => {
          const previous = points[index]!;
          return (
            Math.abs(point.x - previous.x) +             Math.abs(point.y - previous.y)
          );
        });
        const longestSegmentIndex = segmentLengths.indexOf(
          Math.max(...segmentLengths),
        );
        const start = points[longestSegmentIndex]!;
        const end = points[longestSegmentIndex + 1] ?? start;
        let angle =
          (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          angle,
        };
      };
      const paths = generatedTables.flatMap((sourceTable) =>
        sourceTable.fields.flatMap((field) => {
          if (!field.references) return [];
          const targetTable = generatedTables.find(
            (table) => table.name === field.references?.table,
          );
          if (!targetTable) return [];

          const sourceCard = diagram.querySelector<HTMLElement>(
            `[data-schema-table="${sourceTable.name}"]`,
          );
          const targetCard = diagram.querySelector<HTMLElement>(
            `[data-schema-table="${targetTable.name}"]`,
          );
          const sourceRow = sourceCard
            ? Array.from(
                sourceCard.querySelectorAll<HTMLElement>("[data-schema-field]"),
              ).find((row) => row.dataset.schemaField === field.name)
            : null;
          const targetRow = targetCard
            ? Array.from(
                targetCard.querySelectorAll<HTMLElement>("[data-schema-field]"),
              ).find(
                (row) =>
                  row.dataset.schemaField === field.references?.field,
              )
            : null;
          if (!sourceCard || !targetCard || !sourceRow || !targetRow) return [];

          const sourceBounds = sourceCard.getBoundingClientRect();
          const targetBounds = targetCard.getBoundingClientRect();
          const sourceRowBounds = sourceRow.getBoundingClientRect();
          const targetRowBounds = targetRow.getBoundingClientRect();
          const sourceCenterX =
            canvasX(sourceBounds.left + sourceBounds.width / 2);
          const targetCenterX =
            canvasX(targetBounds.left + targetBounds.width / 2);
          const sameColumn = Math.abs(sourceCenterX - targetCenterX) < 2;
          const sourceOnRight = sourceCenterX <= targetCenterX || sameColumn;
          const sourceX =
            canvasX(sourceOnRight ? sourceBounds.right : sourceBounds.left);
          const targetX =
            canvasX(sameColumn
              ? targetBounds.right
              : sourceOnRight
                ? targetBounds.left
                : targetBounds.right);
          const sourceY =
            canvasY(sourceRowBounds.top + sourceRowBounds.height / 2);
          const targetY =
            canvasY(targetRowBounds.top + targetRowBounds.height / 2);
          const middleX = sameColumn
            ? Math.max(sourceX, targetX) + 48
            : (sourceX + targetX) / 2;
          const routeElbow = () => {
            const obstacles = tableBounds.filter(
              (table) =>
                table.name !== sourceTable.name &&
                table.name !== field.references?.table,
            );
            const minX = Math.min(...tableBounds.map((table) => table.left));
            const maxX = Math.max(...tableBounds.map((table) => table.right));
            const minY = Math.min(...tableBounds.map((table) => table.top));
            const maxY = Math.max(...tableBounds.map((table) => table.bottom));
            const xChannels = [
              middleX,
              ...tableBounds.flatMap((table) => [
                table.left - 20,
                table.right + 20,
              ]),
              minX - 20,
              maxX + 20,
            ];
            const yChannels = [
              (sourceY + targetY) / 2,
              ...tableBounds.flatMap((table) => [
                table.top - 20,
                table.bottom + 20,
              ]),
              minY - 20,
              maxY + 20,
            ];
            const isHorizontalClear = (
              x1: number,
              x2: number,
              y: number,
            ) =>
              !obstacles.some(
                (table) =>
                  y > table.top &&
                  y < table.bottom &&
                  Math.max(Math.min(x1, x2), table.left) <
                    Math.min(Math.max(x1, x2), table.right),
              );
            const isVerticalClear = (
              x: number,
              y1: number,
              y2: number,
            ) =>
              !obstacles.some(
                (table) =>
                  x > table.left &&
                  x < table.right &&
                  Math.max(Math.min(y1, y2), table.top) <
                    Math.min(Math.max(y1, y2), table.bottom),
              );
            const clearRoutes = [
              ...xChannels.flatMap((channelX) =>
                isHorizontalClear(sourceX, channelX, sourceY) &&
                isVerticalClear(channelX, sourceY, targetY) &&
                isHorizontalClear(channelX, targetX, targetY)
                  ? [
                      {
                        path: `M ${sourceX} ${sourceY} H ${channelX} V ${targetY} H ${targetX}`,
                        points: [
                          { x: sourceX, y: sourceY },
                          { x: channelX, y: sourceY },
                          { x: channelX, y: targetY },
                          { x: targetX, y: targetY },
                        ],
                        distance:
                          Math.abs(channelX - sourceX) +
                          Math.abs(targetY - sourceY) +
                          Math.abs(targetX - channelX),
                      },
                    ]
                  : [],
              ),
              ...yChannels.flatMap((channelY) =>
                isVerticalClear(sourceX, sourceY, channelY) &&
                isHorizontalClear(sourceX, targetX, channelY) &&
                isVerticalClear(targetX, channelY, targetY)
                  ? [
                      {
                        path: `M ${sourceX} ${sourceY} V ${channelY} H ${targetX} V ${targetY}`,
                        points: [
                          { x: sourceX, y: sourceY },
                          { x: sourceX, y: channelY },
                          { x: targetX, y: channelY },
                          { x: targetX, y: targetY },
                        ],
                        distance:
                          Math.abs(channelY - sourceY) +
                          Math.abs(targetX - sourceX) +
                          Math.abs(targetY - channelY),
                      },
                    ]
                  : [],
              ),
            ];
            const selectedRoute = clearRoutes.sort(
              (first, second) => first.distance - second.distance,
            )[0];
            const points = selectedRoute
              ? selectedRoute.points
              : [
                  { x: sourceX, y: sourceY },
                  { x: sourceOnRight ? maxX + 20 : minX - 20, y: sourceY },
                  { x: sourceOnRight ? maxX + 20 : minX - 20, y: targetY },
                  { x: targetX, y: targetY },
                ];
            return {
              path:
                selectedRoute?.path ??
                `M ${sourceX} ${sourceY} H ${sourceOnRight ? maxX + 20 : minX - 20} V ${targetY} H ${targetX}`,
              label: getPolylineLabelPosition(points),
            };
          };
          const direction = sameColumn || sourceOnRight ? 1 : -1;
          const curveBend = Math.max(
            32,
            Math.min(96, Math.abs(targetX - sourceX) * 0.45),
          );
          const path =
            schemaRelationshipStyle === "straight"
              ? {
                  path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
                  label: {
                    x: (sourceX + targetX) / 2,
                    y: (sourceY + targetY) / 2,
                    angle: (() => {
                      let angle =
                        (Math.atan2(targetY - sourceY, targetX - sourceX) *
                          180) /
                        Math.PI;
                      if (angle > 90) angle -= 180;
                      if (angle < -90) angle += 180;
                      return angle;
                    })(),
                  },
                }
              : schemaRelationshipStyle === "bezier"
                ? {
                    path: `M ${sourceX} ${sourceY} C ${sourceX + direction * curveBend} ${sourceY}, ${targetX + (sameColumn ? direction : -direction) * curveBend} ${targetY}, ${targetX} ${targetY}`,
                    label: {
                      x:
                        (sourceX +
                          3 * (sourceX + direction * curveBend) +
                          3 *
                            (targetX +
                              (sameColumn ? direction : -direction) *
                                curveBend) +
                          targetX) /
                        8,
                      y: (sourceY + targetY) / 2,
                      angle: (() => {
                        const control1X = sourceX + direction * curveBend;
                        const control2X =
                          targetX +
                          (sameColumn ? direction : -direction) * curveBend;
                        let angle =
                          (Math.atan2(
                            1.5 * (targetY - sourceY),
                            1.5 * (control2X - control1X) +
                              0.75 * (targetX - sourceX),
                          ) *
                            180) /
                          Math.PI;
                        if (angle > 90) angle -= 180;
                        if (angle < -90) angle += 180;
                        return angle;
                      })(),
                    },
                  }
                : routeElbow();

          return [
            {
              key: `${sourceTable.name}.${field.name}`,
              sourceTable: sourceTable.name,
              targetTable: field.references.table,
              target: `${field.references.table}.${field.references.field}`,
              path: path.path,
              start: { x: sourceX, y: sourceY },
              end: { x: targetX, y: targetY },
              label: `${field.name} -> ${field.references.field}`,
              labelX: path.label.x,
              labelY: path.label.y,
              labelAngle: path.label.angle,
            },
          ];
        }),
      );

      setSchemaDiagramSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
      setSchemaRelationshipPaths((current) =>
        current.length === paths.length &&
        current.every((item, index) => item.path === paths[index]?.path)
          ? current
          : paths,
      );
    };

    const frame = window.requestAnimationFrame(updateRelationships);
    const resizeObserver = new ResizeObserver(updateRelationships);
    resizeObserver.observe(diagram);
    if (schemaCanvasViewportRef.current) {
      resizeObserver.observe(schemaCanvasViewportRef.current);
    }
    diagram
      .querySelectorAll<HTMLElement>("[data-schema-table]")
      .forEach((card) => resizeObserver.observe(card));
    window.addEventListener("resize", updateRelationships);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateRelationships);
    };
  }, [
    generatedTables,
    schemaRelationshipStyle,
    schemaTablePositions,
    schemaZoom,
    view,
  ]);

  useEffect(() => {
    const container = dataScrollRef.current;
    if (!container || view !== "table") return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaX === 0 && event.deltaY === 0) return;

      if (dataScrollAxisRef.current === null) {
        dataScrollAxisRef.current =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? "horizontal"
            : "vertical";
      }

      if (dataScrollIdleTimerRef.current !== null) {
        window.clearTimeout(dataScrollIdleTimerRef.current);
      }
      dataScrollIdleTimerRef.current = window.setTimeout(() => {
        dataScrollAxisRef.current = null;
        dataScrollIdleTimerRef.current = null;
      }, 180);

      event.preventDefault();
      const delta =
        dataScrollAxisRef.current === "horizontal"
          ? event.deltaX
          : event.deltaY;
      const scale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1;

      if (dataScrollAxisRef.current === "horizontal") {
        container.scrollLeft += delta * scale;
      } else {
        container.scrollTop += delta * scale;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (dataScrollIdleTimerRef.current !== null) {
        window.clearTimeout(dataScrollIdleTimerRef.current);
        dataScrollIdleTimerRef.current = null;
      }
      dataScrollAxisRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    if (!exampleFlyoutOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !exampleFlyoutRef.current?.contains(event.target)
      ) {
        setExampleFlyoutOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExampleFlyoutOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [exampleFlyoutOpen]);

  useEffect(() => {
    if (
      previewAttachmentIndex === null &&
      !composerAttachmentFlyoutOpen
    ) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !attachmentFlyoutRef.current?.contains(event.target) &&
        !messageAttachmentButtonRef.current?.contains(event.target) &&
        !composerAttachmentFlyoutRef.current?.contains(event.target)
      ) {
        setPreviewAttachmentIndex(null);
        setComposerAttachmentFlyoutOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewAttachmentIndex(null);
        setComposerAttachmentFlyoutOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [composerAttachmentFlyoutOpen, previewAttachmentIndex]);

  useEffect(() => {
    if (!requestedConversationId) return;
    let active = true;

    void getAiConversation({ id: requestedConversationId, workspaceId })
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setSaveError(result.error);
          return;
        }
        setConversationId(result.data.id);
        pendingConversationScrollRef.current = "auto";
        setConversation(result.data.messages);
        const pendingTextAttachment = [...result.data.messages]
          .reverse()
          .find(
            (message) =>
              message.role === "user" &&
              message.attachmentName &&
              message.attachmentContents,
          );
        setTextAttachment(
          pendingTextAttachment?.attachmentName &&
            pendingTextAttachment.attachmentContents
            ? {
                name: pendingTextAttachment.attachmentName,
                contents: pendingTextAttachment.attachmentContents,
                size: new TextEncoder().encode(
                  pendingTextAttachment.attachmentContents,
                ).byteLength,
              }
            : null,
        );
        setArtifacts(result.data.artifacts);
        setExampleFlyoutOpen(false);
        setPrompt("");
        setDataset(null);
        setGeneratedTables([]);
        setView("table");
        setError("");
        setSaveError("");
        onConversationOpened(result.data.id);
      })
      .catch(() => {
        if (active) {
          setSaveError(
            "A network error occurred while opening the saved chat.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [requestedConversationId, onConversationOpened, workspaceId]);

  const persistConversation = async (
    messages: ConversationMessage[],
    id: string | null,
  ) => {
    const result = await saveAiConversation({
      id: id ?? undefined,
      workspaceId,
      messages,
    });
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
      setError(
        parsed.error.issues[0]?.message ?? "Check the dataset settings.",
      );
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
    setShowDataPanel(true);
    setGeneratedTables([]);
    setSchemaTablePositions({});
    setArtifacts([]);
    setConversation([]);
    setTextAttachment(null);
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
    const userPrompt = prompt.trim();
    const userMessage =
      userPrompt ||
      (textAttachment
        ? `Use the attached text file "${textAttachment.name}" to design the schema.`
        : "");
    if (!canSubmitPrompt || generating) return;

    const contextMessages: ConversationMessage[] = conversation.map((message) => {
      if (!textAttachment || !message.attachmentContents) {
        return message;
      }
      return { ...message, attachmentContents: undefined };
    });
    const messages: ConversationMessage[] = [
      ...contextMessages,
      {
        role: "user" as const,
        content: userMessage,
        ...(textAttachment
          ? {
              attachmentName: textAttachment.name,
              attachmentSizeBytes: textAttachment.size,
              attachmentContents: textAttachment.contents,
            }
          : {}),
      },
    ];
    const modelMessages = includeTextAttachmentsInMessages(messages.slice(-8));
    pendingConversationScrollRef.current = "smooth";
    setConversation(messages);
    setPrompt("");
    setTextAttachment(null);
    setComposerAttachmentFlyoutOpen(false);
    setError("");
    setDataset(null);
    setGeneratedTables([]);
    setSchemaTablePositions({});
    setGenerationPhase("analyzing");
    setGenerating(true);
    const phaseTimeout = window.setTimeout(
      () => setGenerationPhase("generating"),
      900,
    );

    try {
      const savedId = await persistConversation(messages, conversationId);
      const result = await generateWithAi({
        messages: modelMessages,
        model: isPro ? model : "qwen",
        workspaceId,
      });
      onWorkspaceCreditsChanged();

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
          {
            role: "assistant" as const,
            content: result.modelNotice
              ? `${result.modelNotice} ${result.question}`
              : result.question,
            modelUsed: result.modelUsed,
          },
        ];
        pendingConversationScrollRef.current = "smooth";
        setConversation(nextMessages);
        await persistConversation(nextMessages, savedId ?? conversationId);
        return;
      }

      const tables = result.data.tables;
      const datasets = tables.map((table) => ({
        name: table.name,
        fields: table.fields,
        records: table.records,
        count: table.count,
        seed: table.seed,
      }));
      setGeneratedTables(datasets);
      setSchemaTablePositions({});
      setDataset(datasets[0] ?? null);
      setShowDataPanel(true);
      setView("table");
      setCopied(false);
      const tableSummary = tables
        .map(
          (table) =>
            `${table.name} (${table.count} records, ${table.fields.length} fields)`,
        )
        .join(", ");
      const savedMessages: ConversationMessage[] = messages.map((message) => {
        if (!message.attachmentContents) return message;
        return { ...message, attachmentContents: undefined };
      });
      const nextMessages = [
        ...savedMessages,
        {
          role: "assistant" as const,
          content: `${result.modelNotice ? `${result.modelNotice} ` : ""}Generated ${tables.length} related tables: ${tableSummary}. Foreign-key references use generated parent records. Open Schema to inspect the proposed database design, or select a table to preview or export its records.`,
          modelUsed: result.modelUsed,
        },
      ];
      pendingConversationScrollRef.current = "smooth";
      setConversation(nextMessages);
      const persistedId = await persistConversation(
        nextMessages,
        savedId ?? conversationId,
      );
      if (persistedId) {
        const savedArtifacts: AiGeneratedArtifact[] = [];
        for (const table of tables) {
          const artifactResult = await saveAiGeneratedArtifact({
            conversationId: persistedId,
            ...table,
          });
          if ("error" in artifactResult) {
            setSaveError(artifactResult.error);
            break;
          }
          savedArtifacts.push(artifactResult.data);
        }
        if (savedArtifacts.length > 0) {
          setArtifacts((current) => [...current, ...savedArtifacts]);
          const lastArtifact = savedArtifacts.at(-1);
          if (lastArtifact) {
            const linkedMessages = nextMessages.map((message, index) =>
              index === nextMessages.length - 1
                ? {
                    ...message,
                    generatedArtifactId: lastArtifact.id,
                    generatedArtifactIds: savedArtifacts.map(
                      (artifact) => artifact.id,
                    ),
                  }
                : message,
            );
            setConversation(linkedMessages);
            await persistConversation(linkedMessages, persistedId);
          }
        }
      }
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

  const downloadAllTables = () => {
    if (generatedTables.length < 2) return;
    const archive = createZipBlob(
      generatedTables.map((table) => ({
        name: `${table.name}.csv`,
        contents: recordsToCsv(table.fields, table.records),
      })),
    );
    const url = URL.createObjectURL(archive);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "synthetic-tables.zip";
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
      setError(
        "Couldn't copy the message. Please select and copy it manually.",
      );
    }
  };

  const selectExample = (example: string) => {
    setMode("agent");
    setPrompt(example);
    setError("");
    setExampleFlyoutOpen(false);
    window.requestAnimationFrame(() => promptInputRef.current?.focus());
  };

  const attachPromptFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (
      !extension ||
      !["sql", "txt", "json", "prisma", "ts", "tsx"].includes(extension)
    ) {
      setError("Choose a .sql, .txt, .json, .prisma, .ts, or .tsx text file.");
      return;
    }

    if (file.size > maxTextAttachmentBytes) {
      setError("Text attachments must be 64 KB or smaller.");
      return;
    }

    let fileContents: string;
    try {
      fileContents = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      setError("The selected file must contain valid UTF-8 text.");
      return;
    }
    if (!fileContents.trim()) {
      setError("The selected file is empty.");
      return;
    }
    if (!isPro && fileContents.length > maxFreeTextAttachmentCharacters) {
      setError(
        "Free users can attach up to 20,000 characters. Pro workspaces have no character limit.",
      );
      return;
    }

    setTextAttachment({
      name: file.name.slice(0, 120),
      contents: fileContents,
      size: file.size,
    });
    setError("");
  };

  const handlePromptPaste = (
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const pastedText = event.clipboardData.getData("text/plain");
    const nextPromptLength =
      prompt.length + pastedText.length;
    if (nextPromptLength <= maxPromptLength) return;

    event.preventDefault();
    if (!pastedText.trim()) return;
    if (!isPro && pastedText.length > maxFreeTextAttachmentCharacters) {
      setError(
        "Free users can attach up to 20,000 characters. Pro workspaces have no character limit.",
      );
      return;
    }

    const pastedTextSize = new TextEncoder().encode(pastedText).byteLength;
    if (pastedTextSize > maxTextAttachmentBytes) {
      setError("Pasted text exceeds the 64 KB attachment limit.");
      return;
    }

    setTextAttachment({
      name: "Attachement",
      contents: pastedText,
      size: pastedTextSize,
    });
    setError("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f9fbf7] pt-[36px] geist text-[13px] font-medium tracking-tight text-[#242620]">
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
        <div className="flex h-full min-w-0 items-center justify-end gap-1">
          {showDataPanel && (
            <div
              className="flex h-full min-w-0 items-center gap-1"
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
              {generatedTables.length > 0 && (
                <button
                  aria-selected={view === "schema"}
                  className={`flex h-full cursor-pointer items-center gap-1 rounded-t-lg px-2 text-[12px] transition ${
                    view === "schema"
                      ? "bg-white font-medium text-[#252721]"
                      : "font-medium text-[#666961] hover:bg-white/60 hover:text-[#252721]"
                  }`}
                  onClick={() => setView("schema")}
                  role="tab"
                  type="button"
                >
                  <Boxes aria-hidden="true" className="size-3.5" />
                  Schema Visualiser
                </button>
              )}
            </div>
          )}
          {showDataPanel && (
            <span className="ml-auto flex min-w-0 items-center gap-1">
              {dataset && view !== "schema" && (
                <span className="shrink-0 mx- font-semibold uppercase rounded-t-lg text-[10px]  tracking-tight capitalize  text-[#696c64]">
                  {dataset.count} rows
                </span>
              )}
              {generatedTables.length > 1 && (
                <button
                  aria-label="Download all tables as ZIP"
                  className="flex size-8 items-center justify-center rounded-t-lg text-[#666961] transition hover:bg-white hover:text-[#252721]"
                  onClick={downloadAllTables}
                  title="Download all tables as ZIP"
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    height="18px"
                    viewBox="0 -960 960 960"
                    width="18px"
                    fill="currentColor"
                  >
                    <path d="M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447-640l-80-80H160v480h400v-80h80v80h160v-400H640v80h-80v-80H447ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80v-480 480Z" />
                  </svg>
                </button>
              )}
              {view !== "table" && (
                <button
                  aria-label={copied ? "Copied data" : "Copy data"}
                  className="flex size-8  cursor-pointer items-center justify-center rounded-t-lg text-[#666961] transition hover:bg-white hover:text-[#252721] disabled:opacity-40"
                  disabled={!dataset || view === "schema"}
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
                disabled={!dataset || view === "table" || view === "schema"}
                onClick={download}
                title={`Download ${view.toUpperCase()}`}
                type="button"
              >
                <Download aria-hidden="true" className="size-4" />
              </button>
            </span>
          )}
          <button
            aria-label={
              showDataPanel ? "Hide output panel" : "Show output panel"
            }
            aria-pressed={showDataPanel}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#666961] transition hover:bg-white/70 hover:text-[#252721] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#858780]"
            onClick={() => setShowDataPanel((visible) => !visible)}
            title={showDataPanel ? "Hide output panel" : "Show output panel"}
            type="button"
          >
            {showDataPanel ? (
              <PanelRightClose aria-hidden="true" className="size-4" />
            ) : (
              <PanelRightOpen aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </header>

      <div
        className={`grid h-0 min-h-0 flex-1 grid-cols-1 overflow-hidden ${
          showDataPanel
            ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-2 md:grid-rows-1"
            : "grid-rows-1"
        }`}
      >
        {mode === "agent" ? (
          <section
            aria-label="AI data prompt"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f1f5ef]"
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
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-8 max-sm:px-4"
              onScroll={updateScrollToBottomVisibility}
              ref={conversationScrollRef}
            >
              {conversation.length > 0 ? (
                <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
                  {conversation.map((message, index) => {
                    const matchesDatasetMessage = (
                      name: string,
                      count: number,
                    ) =>
                      message.content.includes(`${count} ${name} records`) ||
                      message.content.includes(`${name} (${count} records`) ||
                      (message.content.includes(`“${name}”`) &&
                        message.content.includes(`${count} synthetic records`));
                    const linkedArtifact =
                      message.role === "assistant"
                        ? (artifacts.find(
                            (artifact) =>
                              artifact.id === message.generatedArtifactId ||
                              message.generatedArtifactIds?.includes(
                                artifact.id,
                              ) ||
                              matchesDatasetMessage(
                                artifact.name,
                                artifact.count,
                              ),
                          ) ?? null)
                        : null;
                    const currentDatasetMatchesMessage =
                      message.role === "assistant" &&
                      dataset !== null &&
                      matchesDatasetMessage(dataset.name, dataset.count);

                    return (
                      <div
                        className={`group flex max-w-full items-start gap-1 ${
                          message.role === "user"
                            ? "ml-auto flex-row-reverse"
                            : "mr-auto"
                        }`}
                        key={`${index}-${message.role}`}
                      >
                        <div
                          className={`max-w-[min(88%,460px)] rounded-2xl border border-[#d1d5cd] px-2 py-2 text-[13px] leading-tight ${
                            message.role === "user"
                              ? "bg-gradient-to-r from-[#e7f2e4] to-[#f0ebf5] text-[#292c27]"
                              : "rounded border-none bg-transparent text-[#30332d]"
                          }`}
                        >
                          {message.content}
                          {message.role === "assistant" &&
                            message.modelUsed && (
                              <p
                                className="mt-1 text-[10px] leading-4 text-[#777a72]"
                                title={`Model used: ${message.modelUsed}`}
                              >
                                Handled by {message.modelUsed}
                              </p>
                            )}
                          {message.attachmentName && (
                            <div
                              className="relative mt-2 w-fit"
                              ref={
                                previewAttachmentIndex === index
                                  ? attachmentFlyoutRef
                                  : null
                              }
                            >
                              <button
                                ref={
                                  previewAttachmentIndex === index
                                    ? messageAttachmentButtonRef
                                    : null
                                }
                                aria-expanded={previewAttachmentIndex === index}
                                aria-haspopup="dialog"
                                aria-label={`View ${message.attachmentName} attachment details`}
                                className="flex size-8 bg-black/5 items-center justify-center gap-0.5 rounded-lg  bg-white text-[#62685d] transition hover:border-[#c5ccc0] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#858780]"
                                onClick={(event) => {
                                  if (previewAttachmentIndex === index) {
                                    setPreviewAttachmentIndex(null);
                                    return;
                                  }
                                  const rect =
                                    event.currentTarget.getBoundingClientRect();
                                  const width = Math.min(
                                    260,
                                    window.innerWidth - 32,
                                  );
                                  setMessageAttachmentFlyoutPosition({
                                    left: Math.max(
                                      16,
                                      Math.min(
                                        rect.left,
                                        window.innerWidth - width - 16,
                                      ),
                                    ),
                                    bottom: window.innerHeight - rect.top + 8,
                                  });
                                  setPreviewAttachmentIndex(index);
                                }}
                                title={message.attachmentName}
                                type="button"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  height="18px"
                                  viewBox="0 -960 960 960"
                                  width="18px"
                                  fill="currentColor"
                                >
                                  <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
                                </svg>
                                <span className="max-w-9 hidden truncate text-[8px] font-semibold uppercase tracking-wide">
                                  {message.attachmentName.split(".").at(-1) ??
                                    "text"}
                                </span>
                              </button>
                              {previewAttachmentIndex === index &&
                                createPortal(
                                  <section
                                    aria-label={`${message.attachmentName} details`}
                                    className="fixed z-[130] w-[min(260px,calc(100vw-32px))] overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_30px_rgba(20,24,18,0.12)]"
                                    ref={attachmentFlyoutRef}
                                    role="dialog"
                                    style={{
                                      left: messageAttachmentFlyoutPosition.left,
                                      bottom:
                                        messageAttachmentFlyoutPosition.bottom,
                                    }}
                                  >
                                    <div className="flex items-center gap-2.5 border-b border-[#e9ece6] px-3 py-2.5">
                                      <FileText
                                        aria-hidden="true"
                                        className="size-5 shrink-0 text-[#6d7566]"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p
                                          className="truncate text-[11px] font-semibold leading-4"
                                          title={message.attachmentName}
                                        >
                                          {message.attachmentName}
                                        </p>
                                        <p className="text-[10px] font-semibold uppercase leading-4 tracking-wide text-[#999]">
                                          Text file
                                        </p>
                                      </div>
                                    </div>
                                    <div className="px-3 py-2.5">
                                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                                        <dt className="text-[#858880]">Size</dt>
                                        <dd className="text-right font-medium text-[#55584f]">
                                          {(
                                            (message.attachmentSizeBytes ??
                                              new TextEncoder().encode(
                                                message.attachmentContents ??
                                                  "",
                                              ).byteLength) / 1024
                                          ).toFixed(1)}{" "}
                                          KB
                                        </dd>
                                        <dt className="text-[#858880]">
                                          Status
                                        </dt>
                                        <dd className="text-right font-medium text-[#55584f]">
                                          {message.attachmentContents
                                            ? "Attached to request"
                                            : "Used for generation"}
                                        </dd>
                                      </dl>
                                      {message.attachmentContents && (
                                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f1f3ef] p-2 text-[9px] leading-4 text-[#62655e]">
                                          {message.attachmentContents.slice(
                                            0,
                                            1_000,
                                          )}
                                          {message.attachmentContents.length > 1
                                            ? "\n…"
                                            : ""}
                                        </pre>
                                      )}
                                    </div>
                                  </section>,
                                  document.body,
                                )}
                            </div>
                          )}
                        </div>
                        <button
                          aria-label={
                            copiedMessageIndex === index
                              ? "Message copied"
                              : `Copy ${message.role} message`
                          }
                          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-[#858880] transition hover:bg-white/70 hover:text-[#252721] focus-visible:outline-2 focus-visible:outline-[#858880] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          onClick={() =>
                            void copyMessage(message.content, index)
                          }
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
                        {(linkedArtifact || currentDatasetMatchesMessage) && (
                          <button
                            aria-label="Open generated dataset"
                            className="mt-0.5 flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-white px-2 text-[10px] font-medium text-[#55584f] shadow-xs transition hover:bg-[#f5f7f3] hover:text-[#252721] focus-visible:outline-2 focus-visible:outline-[#858780]"
                            onClick={() => {
                              if (linkedArtifact) {
                                const linkedDatasets = artifacts
                                  .filter((artifact) =>
                                    message.generatedArtifactIds
                                      ? message.generatedArtifactIds.includes(
                                          artifact.id,
                                        )
                                      : matchesDatasetMessage(
                                          artifact.name,
                                          artifact.count,
                                        ),
                                  )
                                  .map((artifact) => ({
                                    name: artifact.name,
                                    fields: artifact.fields,
                                    records: artifact.records,
                                    count: artifact.count,
                                    seed: artifact.seed,
                                  }));
                                setGeneratedTables(
                                  linkedDatasets.length > 1
                                    ? linkedDatasets
                                    : [
                                        {
                                          name: linkedArtifact.name,
                                          fields: linkedArtifact.fields,
                                          records: linkedArtifact.records,
                                          count: linkedArtifact.count,
                                          seed: linkedArtifact.seed,
                                        },
                                      ],
                                );
                                setSchemaTablePositions({});
                                setDataset({
                                  name: linkedArtifact.name,
                                  fields: linkedArtifact.fields,
                                  records: linkedArtifact.records,
                                  count: linkedArtifact.count,
                                  seed: linkedArtifact.seed,
                                });
                              }
                              setShowDataPanel(true);
                              setView("table");
                              setError("");
                            }}
                            title="Open generated dataset in Data panel"
                            type="button"
                          >
                            <FileText aria-hidden="true" className="size-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
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
                    Describe an app or business scenario and I&apos;ll design
                    related tables for it. You can also paste a JSON,
                    TypeScript, SQL, or Prisma schema.
                  </p>

                  <div className="mt-5 hidden gap-1">
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
                <div
                  className={`relative flex h-8 shrink-0 items-center justify-center rounded-full bg-white px-1 text-[12px] text-[#696c64] motion-safe:transition-[width,gap] motion-safe:duration-200 motion-safe:ease-in-out ${
                    exampleFlyoutOpen ? "overflow-visible" : "overflow-hidden"
                  } ${showScrollToBottom ? "w-[4.25rem] gap-1" : "w-8 gap-0"}`}
                  ref={exampleFlyoutRef}
                >
                  <button
                    aria-controls="generation-examples-flyout"
                    aria-expanded={exampleFlyoutOpen}
                    aria-haspopup="dialog"
                    aria-label="Try an example"
                    className=" w-6 h-6 flex items-center justify-center rounded-full cursor-pointer  text-[#20221e]"
                    onClick={() => setExampleFlyoutOpen((isOpen) => !isOpen)}
                    title="Try an example"
                    type="button"
                  >
                    <MessageSquareText
                      aria-hidden="true"
                      className="size-[15px] text-[#858880]"
                    />
                  </button>
                  {exampleFlyoutOpen && (
                    <section
                      aria-label="Generation examples"
                      className="absolute tracking-tight bottom-[calc(100%+10px)] left-0 z-40 w-[min(340px,calc(100vw-48px))] rounded-xl border border-[#e2e5df] bg-white p-2 text-left shadow-[0_12px_36px_rgba(20,24,18,0.16)]"
                      id="generation-examples-flyout"
                      role="dialog"
                    >
                      <div className="mb-2 hidden flex items-center justify-between gap-3">
                        <h2 className="text-[12px] font-semibold text-[#373a34]">
                          Try an example
                        </h2>
                        <span className="text-[10px] text-[#858880]">
                          Select one to fill the prompt
                        </span>
                      </div>
                      <ul className="space-y-1 ">
                        {examples.map((example) => (
                          <li key={example}>
                            <button
                              className="w-full rounded-lg  p-2 text-left text-[11px] leading-4 text-[#55584f] transition hover:bg-[#f5f7f3] focus-visible:outline-2 focus-visible:outline-[#858780]"
                              onClick={() => selectExample(example)}
                              type="button"
                            >
                              {example}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <span
                    aria-hidden="true"
                    className={`h-3 shrink-0 bg-black/10 transition-[width,opacity] duration-200 ${
                      showScrollToBottom ? "w-px opacity-100" : "w-0 opacity-0"
                    }`}
                  />

                  <button
                    aria-label="Scroll to latest message"
                    aria-hidden={!showScrollToBottom}
                    className={`flex h-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full text-[#20221e] transition-[width,opacity,transform,background-color] duration-200 hover:bg-[#f5f7f3] ${
                      showScrollToBottom
                        ? "w-6 translate-x-0 opacity-100"
                        : "w-0 translate-x-1 opacity-0"
                    }`}
                    disabled={!showScrollToBottom}
                    tabIndex={showScrollToBottom ? 0 : -1}
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
                </div>
              </div>
              <label className="sr-only hidden" htmlFor="dataset-prompt">
                Describe the data to generate
              </label>
              <div className="flex flex-col items-end gap-2 duration-300 transition-all mx-auto max-w-120 rounded-2xl border border-[#d7dbd4] bg-white p-3 focus-within:border-[#aeb3a9]">
                {textAttachment && (
                  <div
                    className="relative mr-auto"
                    ref={composerAttachmentFlyoutRef}
                  >
                    <button
                      aria-expanded={composerAttachmentFlyoutOpen}
                      aria-haspopup="dialog"
                      aria-label={`View ${textAttachment.name} attachment details`}
                      className="flex size-8 p-0.5 flex-col bg-black/5 items-center justify-center gap-0.5 rounded text-[#999] transition hover:border-[#c5ccc0] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#858780]"
                      onClick={() =>
                        setComposerAttachmentFlyoutOpen((open) => !open)
                      }
                      title={textAttachment.name}
                      type="button"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="18px"
                        viewBox="0 -960 960 960"
                        width="18px"
                        fill="currentColor"
                      >
                        <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
                      </svg>
                      <span className="max-w-9 hidden truncate text-[8px] font-semibold uppercase tracking-wide">
                        {textAttachment.name.split(".").at(-1) ?? "text"}
                      </span>
                    </button>
                    {composerAttachmentFlyoutOpen && (
                      <section
                        aria-label={`${textAttachment.name} details`}
                        className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(260px,calc(100vw-64px))] overflow-hidden rounded-lg border border-[#dfe2dc] bg-[#fbfcf9] text-[#242620] shadow-[0_8px_30px_rgba(20,24,18,0.12)]"
                        role="dialog"
                      >
                        <div className="flex items-center gap-2.5 border-b border-[#e9ece6] px-3 py-2.5">
                          <FileText
                            aria-hidden="true"
                            className="size-5 shrink-0 text-[#6d7566]"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-[11px] font-semibold leading-4"
                              title={textAttachment.name}
                            >
                              {textAttachment.name}
                            </p>
                            <p className="text-[10px] font-semibold uppercase leading-4 tracking-wide text-[#999]">
                              Text file
                            </p>
                          </div>
                        </div>
                        <div className="px-3 py-2.5">
                          <p className="text-[10px] text-[#777a72]">
                            {(textAttachment.size / 1024).toFixed(1)} KB · Ready
                            to attach
                          </p>
                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f1f3ef] p-2 text-[9px] leading-4 text-[#62655e]">
                            {textAttachment.contents.slice(0, 1_000)}
                            {textAttachment.contents.length > 1_000
                              ? "\n…"
                              : ""}
                          </pre>
                          <button
                            className="mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium text-[#a64239] transition hover:bg-[#f9eeec] focus-visible:outline-2 focus-visible:outline-[#a64239]"
                            disabled={generating}
                            onClick={() => {
                              setTextAttachment(null);
                              setComposerAttachmentFlyoutOpen(false);
                            }}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="size-3" />
                            Remove attachment
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                )}
                <textarea
                  className="max-h-32 min-h-[40px] w-full min-w-0 flex-1 resize-none field-sizing-content bg-transparent px-1 py-1 text-[14px] leading-[1.5] font-medium outline-none placeholder:text-[#858880]"
                  disabled={generating}
                  id="dataset-prompt"
                  maxLength={maxPromptLength}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  onPaste={handlePromptPaste}
                  placeholder="Describe a scenario and the data your app needs..."
                  ref={promptInputRef}
                  value={prompt}
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={promptFileInputRef}
                    accept=".sql,.txt,.json,.prisma,.ts,.tsx"
                    className="hidden"
                    disabled={generating}
                    onChange={attachPromptFile}
                    type="file"
                  />
                  <button
                    aria-label="Attach a SQL or schema file"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white cursor-pointer text-white transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={generating}
                    onClick={() => promptFileInputRef.current?.click()}
                    title="Attach a SQL or schema text file"
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="0 -960 960 960"
                      width="18px"
                      fill="#999"
                      className="-rotate-45"
                    >
                      <path d="M330-240q-104 0-177-73T80-490q0-104 73-177t177-73h370q75 0 127.5 52.5T880-560q0 75-52.5 127.5T700-380H350q-46 0-78-32t-32-78q0-46 32-78t78-32h370v80H350q-13 0-21.5 8.5T320-490q0 13 8.5 21.5T350-460h350q42-1 71-29.5t29-70.5q0-42-29-71t-71-29H330q-71-1-120.5 49T160-490q0 70 49.5 119T330-320h390v80H330Z" />
                    </svg>
                  </button>
                  <button
                    aria-label={
                      generating ? "Generating data" : "Generate data"
                    }
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
              </div>

              <div>
                <p className="mt-2 flex text-center mx-auto max-w-fit text-[10px] font-semibold text-[#999]">
                  Long pastes attach as text. Free: 20,000 characters; Pro: no
                  character limit (64 KB file limit). Review generated data.
                </p>
              </div>
            </form>
          </section>
        ) : (
          <section
            aria-label="Manual data configuration"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#f1f5ef]"
          >
            <form
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 max-sm:px-4"
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

        {showDataPanel && (
          <section
            aria-label="Generated data"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white"
          >
            {generatedTables.length > 1 && dataset && (
              <div className="flex h-fit py-0.5 shrink-0 items-center gap-2 border-b border-[#eff0ec] px-3">
                <div
                  aria-label="Generated tables"
                  className="flex min-w-0 flex-1 items-center overflow-x-auto"
                  role="group"
                >
                  {generatedTables.map((table) => {
                    const isSelected = table.name === dataset.name;
                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`flex h-6 shrink-0 font-medium  cursor-pointer items-center gap-2 rounded px-2.5 text-xs transition hover:bg-[#f5f6f3] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#858780] ${
                          isSelected ? " text-[#41433d]" : " text-[#777a72]"
                        }`}
                        key={table.name}
                        onClick={() => {
                          setDataset(table);
                          setView("table");
                          setCopied(false);
                        }}
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          className="size-[14px] shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <rect
                            height="16"
                            rx="2"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            width="18"
                            x="3"
                            y="4"
                          />
                          <path
                            d="M3 9h18M9 9v11m6-11v11"
                            stroke="currentColor"
                            strokeWidth="1.7"
                          />
                        </svg>
                        {table.name}
                      </button>
                    );
                  })}
                </div>
                <span
                  aria-label={`${generatedTables.reduce((total, table) => total + table.records.length, 0)} total generated records`}
                  className="shrink-0 border-l border-[#e5e8e2] pl-1 text-xs font-medium text-[#21824b]"
                  title="Total generated records"
                >
                  {generatedTables
                    .reduce((total, table) => total + table.records.length, 0)
                    .toLocaleString()}{" "}
                  rows
                </span>
              </div>
            )}
            <div
              className={`min-h-0 flex-1 overscroll-contain ${
                view === "schema" ? "overflow-hidden" : "overflow-auto"
              }`}
              ref={dataScrollRef}
            >
              {!dataset ? (
                <div className="flex h-full min-h-[300px] items-center justify-center px-6 text-center">
                  <p className="max-w-[260px] text-[xs leading-tight font-medium text-[#777a72]">
                    Your generated data will appear here.
                  </p>
                </div>
              ) : view === "schema" ? (
                  <div className="relative h-full min-h-0 w-full overflow-hidden">
                    <div className="absolute left-3 top-3 z-30 flex flex-wrap items-center gap-2">
                      <div
                        aria-label="Relationship line style"
                        className="flex items-center rounded-md border border-[#dfe3dd] bg-white/95 p-0.5 shadow-sm"
                        role="group"
                      >
                        <button
                          aria-pressed={schemaRelationshipStyle === "elbow"}
                          className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                            schemaRelationshipStyle === "elbow"
                              ? "bg-[#eef2eb] text-[#3f5838]"
                              : "text-[#686a64] hover:bg-[#f5f6f3]"
                          }`}
                          onClick={() => setSchemaRelationshipStyle("elbow")}
                          type="button"
                        >
                          Elbow
                        </button>
                        <button
                          aria-pressed={schemaRelationshipStyle === "straight"}
                          className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                            schemaRelationshipStyle === "straight"
                              ? "bg-[#eef2eb] text-[#3f5838]"
                              : "text-[#686a64] hover:bg-[#f5f6f3]"
                          }`}
                          onClick={() => setSchemaRelationshipStyle("straight")}
                          type="button"
                        >
                          Straight
                        </button>
                        <button
                          aria-pressed={schemaRelationshipStyle === "bezier"}
                          className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                            schemaRelationshipStyle === "bezier"
                              ? "bg-[#eef2eb] text-[#3f5838]"
                              : "text-[#686a64] hover:bg-[#f5f6f3]"
                          }`}
                          onClick={() => setSchemaRelationshipStyle("bezier")}
                          type="button"
                        >
                          Bezier
                        </button>
                      </div>
                      <div
                        aria-label="Schema zoom controls"
                        className="flex items-center gap-1 rounded-md border border-[#dfe3dd] bg-white/95 p-0.5 shadow-sm"
                      >
                        <button
                          aria-label="Zoom out schema"
                          className="flex size-6 items-center justify-center rounded text-[#555850] transition hover:bg-[#f1f3ee] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={schemaZoom <= 0.5}
                          onClick={() =>
                            setSchemaZoom((zoom) =>
                              Math.max(0.5, Number((zoom - 0.1).toFixed(2))),
                            )
                          }
                          type="button"
                        >
                          <ZoomOut aria-hidden="true" className="size-4" />
                        </button>
                        <button
                          aria-label="Reset schema zoom"
                          className="size-6 rounded px-1 text-[10px] font-semibold tabular-nums text-[#555850] transition hover:bg-[#f1f3ee]"
                          onClick={() => setSchemaZoom(1)}
                          title="Reset zoom"
                          type="button"
                        >
                          {Math.round(schemaZoom * 100)}
                        </button>
                        <button
                          aria-label="Zoom in schema"
                          className="flex size-6 items-center justify-center rounded text-[#555850] transition hover:bg-[#f1f3ee] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={schemaZoom >= 1.5}
                          onClick={() =>
                            setSchemaZoom((zoom) =>
                              Math.min(1.5, Number((zoom + 0.1).toFixed(2))),
                            )
                          }
                          type="button"
                        >
                          <ZoomIn aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      aria-label="Schema relationship diagram canvas"
                      className={`absolute inset-0 overflow-auto overscroll-contain ${
                        isSchemaPanning ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    onPointerCancel={(event) => {
                      if (schemaPanRef.current?.pointerId !== event.pointerId) {
                        return;
                      }
                      schemaPanRef.current = null;
                      setIsSchemaPanning(false);
                    }}
                    onPointerDown={(event) => {
                      if (
                        event.pointerType !== "mouse" ||
                        event.button !== 0 ||
                        (event.target as HTMLElement).closest(
                          "[data-schema-table]",
                        )
                      ) {
                        return;
                      }
                      const viewport = schemaCanvasViewportRef.current;
                      if (!viewport) return;
                      schemaPanRef.current = {
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        scrollLeft: viewport.scrollLeft,
                        scrollTop: viewport.scrollTop,
                      };
                      viewport.setPointerCapture(event.pointerId);
                      setIsSchemaPanning(true);
                    }}
                    onPointerMove={(event) => {
                      const pan = schemaPanRef.current;
                      const viewport = schemaCanvasViewportRef.current;
                      if (
                        !pan ||
                        pan.pointerId !== event.pointerId ||
                        !viewport
                      ) {
                        return;
                      }
                      viewport.scrollLeft =
                        pan.scrollLeft - (event.clientX - pan.startX);
                      viewport.scrollTop =
                        pan.scrollTop - (event.clientY - pan.startY);
                    }}
                    onPointerUp={(event) => {
                      if (schemaPanRef.current?.pointerId !== event.pointerId) {
                        return;
                      }
                      schemaPanRef.current = null;
                      setIsSchemaPanning(false);
                    }}
                    ref={schemaCanvasViewportRef}
                    role="region"
                    tabIndex={0}
                  >
                    <div
                      className="relative"
                      style={{
                        width: schemaDiagramSize.width * schemaZoom,
                        height: schemaDiagramSize.height * schemaZoom,
                      }}
                    >
                      <div
                        className="absolute left-0 top-0 min-h-[480px] h-max min-w-[900px] rounded-md bg-[#fbfcf9]"
                        ref={schemaDiagramRef}
                        style={{
                          width: schemaDiagramSize.width,
                          height: schemaDiagramSize.height,
                          backgroundImage:
                            "radial-gradient(#d8ddd5 0.75px, transparent 0.75px)",
                          backgroundSize: "14px 14px",
                          transform: `scale(${schemaZoom})`,
                          transformOrigin: "top left",
                        }}
                      >
                        {schemaDiagramSize.width > 0 &&
                          schemaDiagramSize.height > 0 && (
                            <svg
                              aria-label="Foreign key relationships between tables"
                              className="pointer-events-none absolute left-0 top-0 z-0"
                              height={schemaDiagramSize.height}
                              role="img"
                              viewBox={`0 0 ${schemaDiagramSize.width} ${schemaDiagramSize.height}`}
                              width={schemaDiagramSize.width}
                            >
                              {schemaRelationshipPaths.map((relationship) => (
                                <g key={relationship.key}>
                                  <title>
                                    {relationship.key} references{" "}
                                    {relationship.target}
                                  </title>
                                  <path
                                    d={relationship.path}
                                    fill="none"
                                    stroke="#7894a6"
                                    strokeWidth="1.5"
                                  />
                                  {draggingSchemaTable !== null &&
                                    (draggingSchemaTable ===
                                      relationship.sourceTable ||
                                      draggingSchemaTable ===
                                        relationship.targetTable) && (
                                      <g>
                                        <path
                                          className="schema-relationship-flow"
                                          d={relationship.path}
                                          fill="none"
                                          stroke="#315f7b"
                                          strokeDasharray="4 10"
                                          strokeLinecap="round"
                                          strokeWidth="2.5"
                                        />
                                        <circle
                                          className="schema-relationship-traveler"
                                          fill="#315f7b"
                                          r="3.5"
                                        >
                                          <animateMotion
                                            dur="1.1s"
                                            path={relationship.path}
                                            repeatCount="indefinite"
                                          />
                                        </circle>
                                      </g>
                                    )}
                                  <g aria-label={relationship.label}>
                                    <g
                                      transform={`translate(${relationship.labelX} ${relationship.labelY}) rotate(${relationship.labelAngle})`}
                                    >
                                    <rect
                                      fill="#ffffff"
                                      height="18"
                                      rx="4"
                                      stroke="#9ab0bd"
                                      strokeWidth="0.8"
                                      width={Math.min(
                                        190,
                                        Math.max(
                                          92,
                                          relationship.label.length * 5.2 + 14,
                                        ),
                                      )}
                                      x={
                                        -Math.min(
                                          190,
                                          Math.max(
                                            92,
                                            relationship.label.length * 5.2 +
                                              14,
                                          ),
                                        ) / 2
                                      }
                                      y={-9}
                                    />
                                    <text
                                      dominantBaseline="middle"
                                      fill="#3f5c6e"
                                      fontSize="8.5"
                                      fontWeight="600"
                                      textAnchor="middle"
                                      x={0}
                                      y={0}
                                    >
                                      {relationship.label}
                                    </text>
                                    </g>
                                  </g>
                                  <circle
                                    cx={relationship.start.x}
                                    cy={relationship.start.y}
                                    fill="#7894a6"
                                    r="3"
                                  />
                                  <circle
                                    cx={relationship.end.x}
                                    cy={relationship.end.y}
                                    fill="#7894a6"
                                    r="3"
                                  />
                                </g>
                              ))}
                            </svg>
                          )}
                        <div className="relative z-10 grid grid-cols-[repeat(3,260px)] items-start gap-x-16 gap-y-12 p-10">
                          {generatedTables.map((table) => (
                            <article
                              aria-label={`${table.name} table schema`}
                              className="w-[260px] overflow-hidden rounded border border-[#dfe3dd] bg-white shadow-[0_2px_8px_rgba(20,24,18,0.08)]"
                              data-schema-table={table.name}
                              key={table.name}
                              style={{
                                transform: `translate(${schemaTablePositions[table.name]?.x ?? 0}px, ${schemaTablePositions[table.name]?.y ?? 0}px)`,
                              }}
                            >
                              <header
                                className={`flex touch-none items-center gap-2 border-b border-[#e5e9e3] bg-[#f7f9f5] px-2.5 py-2 ${
                                  draggingSchemaTable === table.name
                                    ? "cursor-grabbing"
                                    : "cursor-grab"
                                }`}
                                data-schema-table-handle
                                onPointerCancel={(event) => {
                                  if (
                                    schemaTableDragRef.current?.pointerId !==
                                    event.pointerId
                                  ) {
                                    return;
                                  }
                                  schemaTableDragRef.current = null;
                                  setDraggingSchemaTable(null);
                                }}
                                onPointerDown={(event) => {
                                  if (
                                    event.pointerType !== "mouse" ||
                                    event.button !== 0
                                  ) {
                                    return;
                                  }
                                  const position = schemaTablePositions[
                                    table.name
                                  ] ?? {
                                    x: 0,
                                    y: 0,
                                  };
                                  schemaTableDragRef.current = {
                                    pointerId: event.pointerId,
                                    tableName: table.name,
                                    startX: event.clientX,
                                    startY: event.clientY,
                                    position,
                                  };
                                  event.currentTarget.setPointerCapture(
                                    event.pointerId,
                                  );
                                  setDraggingSchemaTable(table.name);
                                }}
                                onPointerMove={(event) => {
                                  const drag = schemaTableDragRef.current;
                                  if (
                                    !drag ||
                                    drag.pointerId !== event.pointerId
                                  ) {
                                    return;
                                  }
                                  setSchemaTablePositions((positions) => ({
                                    ...positions,
                                    [drag.tableName]: {
                                      x: Math.max(
                                        -32,
                                        drag.position.x +
                                          (event.clientX - drag.startX) /
                                            schemaZoom,
                                      ),
                                      y: Math.max(
                                        -32,
                                        drag.position.y +
                                          (event.clientY - drag.startY) /
                                            schemaZoom,
                                      ),
                                    },
                                  }));
                                }}
                                onPointerUp={(event) => {
                                  if (
                                    schemaTableDragRef.current?.pointerId !==
                                    event.pointerId
                                  ) {
                                    return;
                                  }
                                  schemaTableDragRef.current = null;
                                  setDraggingSchemaTable(null);
                                }}
                              >
                                <Table2
                                  aria-hidden="true"
                                  className="size-3.5 shrink-0 text-[#66705f]"
                                />
                                <h3 className="truncate text-xs font-semibold tracking-tight text-[#30322d]">
                                  {table.name}
                                </h3>
                              </header>
                              <ul className="divide-y divide-[#f0f2ed]">
                                {table.fields.map((field) => (
                                  <li
                                    className="flex min-w-0 items-center gap-2 px-2.5 py-2"
                                    data-schema-field={field.name}
                                    key={field.name}
                                  >
                                    <span
                                      className={`min-w-0 flex-1 truncate text-xs ${
                                        field.primaryKey
                                          ? "font-semibold text-[#30322d]"
                                          : "font-medium text-[#4e5049]"
                                      }`}
                                    >
                                      {field.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-[#92958d]">
                                      {field.type}
                                    </span>
                                    {field.primaryKey && (
                                      <span
                                        className="shrink-0 rounded bg-[#eef4e9] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#536346]"
                                        title="Primary key"
                                      >
                                        PK
                                      </span>
                                    )}
                                    {field.references && (
                                      <span
                                        className="shrink-0 rounded bg-[#edf3fa] px-1.5 py-0.5 text-[9px] font-semibold text-[#52687e]"
                                        title={`References ${field.references.table}.${field.references.field}`}
                                      >
                                        FK
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
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
                            title={
                              record[field.name] === null
                                ? "NULL"
                                : String(record[field.name])
                            }
                          >
                            {record[field.name] === null
                              ? "NULL"
                              : String(record[field.name])}
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
        )}
      </div>
    </div>
  );
}
