"use client";

import {
  ArrowUp,
  Check,
  Copy,
  Download,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { generateWithAi } from "@/app/actions/generate-with-ai";
import {
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

const examples = [
  "50 users with names, emails, and job titles",
  "25 products with names, prices, and categories",
 
];

export default function GeneratorPanel() {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState("25");
  const [seed, setSeed] = useState("42");
  const [dataset, setDataset] = useState<GeneratedDataset | null>(null);
  const [view, setView] = useState<DataView>("table");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatedCsv = dataset
    ? recordsToCsv(dataset.fields, dataset.records)
    : "";
  const generatedJson = dataset
    ? JSON.stringify(dataset.records, null, 2)
    : "";
  const formattedData =
    view === "json" ? generatedJson : view === "csv" ? generatedCsv : "";

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setDataset(null);
    setGenerating(true);

    try {
      const result = await generateWithAi({
        prompt,
        count: count === "" ? Number.NaN : Number(count),
        seed: seed === "" ? Number.NaN : Number(seed),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setDataset(result.data);
      setView("table");
      setCopied(false);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
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

  const selectExample = (example: string) => {
    setPrompt(example);
    setError("");
  };

  return (
    <div className="flex h-full tracking-tight  min-h-0 flex-col bg-[#f9fbf7] pt-[36px] geist text-[13px] font-medium text-[#242620]">
      <header className="grid  shrink-0 grid-cols-2 items-center">
        <div className="flex h-full items-center ">
          <div className="flex h-full items-center gap-2 rounded-t-lg bg-[#f1f5ef] px-3 text-[14px] font-medium text-[#20221e]">
            <MessageSquareText aria-hidden="true" className="size-[13px]" />
            Agent
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
                className={`h-full flex items-center  rounded-t-lg px-2 cursor-pointer text-[12px] transition ${
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
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    height="16px"
                    viewBox="0 -960 960 960"
                    width="16px"
                    fill="#999"
                  >
                    <path d="m384-336 56-57-87-87 87-87-56-57-144 144 144 144Zm192 0 144-144-144-144-56 57 87 87-87 87 56 57ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
                  </svg>
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
        <section
          aria-label="AI data prompt"
          className="flex min-h-[360px] min-w-0 flex-col bg-[#f1f5ef]"
        >
          <div className="flex-1 overflow-y-auto px-8 py-8 max-sm:px-4">
            {dataset ? (
              <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-gradient-to-r from-[#e7f2e4] to-[#f0ebf5] px-4 py-3 text-[14px] leading-[1.55] font-medium text-[#292c27]">
                {prompt}
              </div>
            ) : (
              <div className="mx-auto mt-[min(10vh,90px)] max-w-[400px]">
                <div className="mb-4 flex size-9 items-center justify-center rounded-full border border-[#e1e5de] text-[#51554d]">
                  <Sparkles aria-hidden="true" className="size-4" />
                </div>
                <h3 className="text-[17px] font-medium tracking-[-0.025em]">
                  What data do you need?
                </h3>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#62655e]">
                  Describe the records and fields. Qwen will shape the dataset,
                  then Synthetic will generate the values.
                </p>
                <div className="mt-5 flex space-y-2">
                  {examples.map((example) => (
                    <button
                      className="block w-full rounded-lg px-3 py-2.5 text-left text-[12px] leading-[1.45] text-[#51544d] transition hover:bg-white/75 hover:text-[#252721]"
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
            <div className="mb-3  hidde flex items-center gap-4">
              <label className="flex items-center gap-2 text-[11px] text-[#696c64]">
                Records
                <input
                  aria-label="Number of records"
                  className="h-7 w-[64px] border-b border-[#d6d9d2] bg-transparent text-[12px] font-medium text-[#30332d] outline-none focus:border-[#6b6d65]"
                  max={500}
                  min={1}
                  onChange={(event) => setCount(event.currentTarget.value)}
                  type="number"
                  value={count}
                />
              </label>
              <label className="flex  items-center gap-2 text-[11px] text-[#696c64]">
                Seed
                <input
                  aria-label="Generation seed"
                  className="h-7 w-[76px] border-b border-[#d6d9d2] bg-transparent text-[12px] font-medium text-[#30332d] outline-none focus:border-[#6b6d65]"
                  max={2_147_483_647}
                  min={0}
                  onChange={(event) => setSeed(event.currentTarget.value)}
                  type="number"
                  value={seed}
                />
              </label>
            </div>

            <div className="max-w-120 justify-between flex w-full mx-auto p-1">
              <div className="flex px-1 gap-1  bg-white h-8 min-w-8 rounded-full justify-center cursor-pointer flex w- items-center  text-[12px] text-[#696c64] hover:text-[#30332d]">
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
                <span className="w-px h-3 bg-black/10" />
                <button
                  className=" w-6 h-6 flex items-center justify-center rounded-full cursor-pointer text-[#20221e] "
                  type="button"
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
            <div className="flex items-end gap-2 mx-auto max-w-120 rounded-2xl border border-[#d7dbd4] bg-white p-3 transition focus-within:border-[#aeb3a9]">
              <textarea
                className="max-h-32 min-h-[70px] min-w-0 flex-1 resize-none field-sizing-content bg-transparent px-1 py-1 text-[14px] leading-[1.5] font-medium outline-none placeholder:text-[#858880]"
                disabled={generating}
                id="dataset-prompt"
                maxLength={2_000}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="20 users with name, email, and signup date"
                required
                value={prompt}
              />
              <button
                aria-label={generating ? "Generating data" : "Generate data"}
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#252721] text-white transition hover:bg-[#41433c] disabled:cursor-wait disabled:opacity-50"
                disabled={generating || prompt.trim().length < 5}
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
