"use client";

import { useMemo, useState } from "react";
import CryptoJS from "crypto-js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clipboard,
  ClipboardCheck,
  FileInput,
  History,
  RefreshCw,
  Upload,
} from "lucide-react";

type HistoryItem = {
  id: string;
  value: string;
  hash32: string;
  hash16: string;
  createdAt: string;
};

const presets = [
  "Flowkit Rocks!",
  "MD5::Encrypted::2025",
  "黑白灰的灵感收藏工具",
];

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function Md5Workbench() {
  const [input, setInput] = useState("");
  const [uppercase, setUppercase] = useState(false);
  const [hash32, setHash32] = useState("");
  const [hash16, setHash16] = useState("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [copiedField, setCopiedField] = useState<"md5-32" | "md5-16" | null>(
    null
  );
  const [fileName, setFileName] = useState<string | null>(null);

  const recalcHash = (value: string, mode: boolean = uppercase) => {
    if (!value) {
      setHash32("");
      setHash16("");
      return;
    }
    const md5 = CryptoJS.MD5(value).toString();
    const digest32 = mode ? md5.toUpperCase() : md5;
    setHash32(digest32);
    setHash16(digest32.slice(8, 24));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setInput(value);
    recalcHash(value);
    setFileName(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      if (typeof content === "string") {
        setInput(content);
        recalcHash(content);
        setFileName(file.name);
      } else if (content instanceof ArrayBuffer) {
        const wordArray = CryptoJS.lib.WordArray.create(
          new Uint8Array(content)
        );
        const md5 = CryptoJS.MD5(wordArray).toString();
        const digest32 = uppercase ? md5.toUpperCase() : md5;
        setHash32(digest32);
        setHash16(digest32.slice(8, 24));
        setInput(`[Binary] ${file.name}`);
        setFileName(file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCopy = async (value: string, field: "md5-32" | "md5-16") => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1600);
  };

  const handleRecord = () => {
    if (!hash32 || !input) return;
    const next: HistoryItem = {
      id: createId(),
      value: input.slice(0, 80),
      hash32,
      hash16,
      createdAt: new Date().toLocaleTimeString(),
    };
    setHistoryItems((prev) => [next, ...prev].slice(0, 4));
  };

  const handlePreset = (value: string) => {
    setInput(value);
    recalcHash(value);
    setFileName(null);
  };

  const stats = useMemo(() => {
    const encoder = new TextEncoder();
    return {
      characters: input.length,
      bytes: encoder.encode(input).length,
    };
  }, [input]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
          <CardHeader>
            <CardTitle>输入内容</CardTitle>
            <CardDescription>支持粘贴文本或上传文件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder="输入待计算的文本..."
                className="min-h-[180px] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-neutral-400 dark:border-white/15 dark:bg-neutral-900 dark:text-white"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 dark:border-white/20 dark:text-white/70">
                <FileInput className="size-4" />
                {fileName ?? "上传文件"}
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                onClick={() => {
                  setInput("");
                  setHash32("");
                  setHash16("");
                  setFileName(null);
                }}
              >
                <RefreshCw className="size-3.5" />
                清空
              </Button>
              <div className="ml-auto flex gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{stats.characters} 字符</span>
                <span>{stats.bytes} 字节</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-white/15 dark:text-white"
                  onClick={() => handlePreset(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
          <CardHeader>
            <CardTitle>MD5 结果</CardTitle>
            <CardDescription>实时生成，支持大小写切换与复制。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-white/15 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>32 位</span>
                <button
                  type="button"
                  className="text-neutral-900 dark:text-white"
                  onClick={() => handleCopy(hash32, "md5-32")}
                >
                  {copiedField === "md5-32" ? (
                    <ClipboardCheck className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-sm text-neutral-900 dark:text-white">
                {hash32 || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-white/15 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>16 位</span>
                <button
                  type="button"
                  className="text-neutral-900 dark:text-white"
                  onClick={() => handleCopy(hash16, "md5-16")}
                >
                  {copiedField === "md5-16" ? (
                    <ClipboardCheck className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-sm text-neutral-900 dark:text-white">
                {hash16 || "—"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={uppercase ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setUppercase((prev) => {
                    const next = !prev;
                    recalcHash(input, next);
                    return next;
                  })
                }
              >
                {uppercase ? "Uppercase" : "Lowercase"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hash32}
                onClick={handleRecord}
              >
                记录本次
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-center gap-3">
          <History className="size-5 text-neutral-500 dark:text-neutral-300" />
          <div>
            <p className="text-sm uppercase tracking-wide text-neutral-500">
              历史记录
            </p>
            <p className="text-lg font-semibold text-neutral-900 dark:text-white">
              最近 {historyItems.length || 0} 条记录
            </p>
          </div>
        </div>
        <Separator className="my-4 bg-neutral-200/70 dark:bg-white/10" />
        {historyItems.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            暂无记录，点击「记录本次」即可保存。
          </p>
        ) : (
          <div className="space-y-4">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-white/15 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{item.createdAt}</span>
                  <Badge variant="outline" className="text-[10px]">
                    Snapshot
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-neutral-900 dark:text-white">
                  {item.value}
                </p>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-neutral-200 px-3 py-2 font-mono text-xs dark:border-white/10">
                    {item.hash32}
                  </div>
                  <div className="rounded-md border border-neutral-200 px-3 py-2 font-mono text-xs dark:border-white/10">
                    {item.hash16}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {[
          {
            title: "批量接口",
            desc: "即将上线，支持批量导入并输出校验表。",
            icon: Upload,
          },
          {
            title: "自定义盐值",
            desc: "将提供更灵活的盐值与多轮迭代配置。",
            icon: RefreshCw,
          },
          {
            title: "API Access",
            desc: "REST 接口接入，方便自动化流程调用。",
            icon: Clipboard,
          },
        ].map((card) => (
          <Card
            key={card.title}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950"
          >
            <div className="flex items-center gap-3">
              <card.icon className="size-5 text-neutral-500 dark:text-neutral-300" />
              <p className="font-semibold text-neutral-900 dark:text-white">
                {card.title}
              </p>
            </div>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {card.desc}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
