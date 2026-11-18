import { visibleCount, type Mode } from '../../shared/core';
import type { SubmittedAnnotation } from '../annotations/annotations';
import type { Config } from '../settings/modelConfig';
import type { ReasoningEffort } from './modelReasoning';
export type DemoGeneration = {
    requestMode: Mode;
    requestLimit: number;
    node: string;
    target: string;
    userPrompt: string;
    submitted?: SubmittedAnnotation[];
    signal: AbortSignal;
};
export async function generateDemoText({ requestMode, requestLimit, node, target, userPrompt, submitted, signal }: DemoGeneration): Promise<string> {
    let raw = '';
    if (signal.aborted)
        throw new DOMException("Stopped", "AbortError");
    await new Promise<void>((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            reject(new DOMException("Stopped", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, 750);
        signal.addEventListener("abort", abort, { once: true });
    });
    if (requestMode === "discuss")
        raw = submitted
            ? `【交互演示】本次收到 ${submitted.length} 处标注。以下展示所提交的片段与备注，不代表真实模型分析。\n\n${submitted.map((item, index) => `${index + 1}.「${item.original}」\n备注：${item.note || "未填写"}\n回应方向：围绕这处文本和备注展开讨论。`).join("\n\n")}`
            : `【交互演示】这一轮可以先围绕「${node}」明确一个观点，再用一个具体例子把它落下来。\n\n当前文档会随每次请求重新读取。接入真实模型后，这里会根据你的要求展开讨论。`;
    else if (requestMode === "edit") {
        const replace = /把[“「"'](.+?)[”」"']\s*(?:改成|换成|替换为)[“「"'](.+?)[”」"']/.exec(userPrompt);
        const text = replace
            ? target.replace(replace[1], replace[2])
            : /简[洁短]|精简/.test(userPrompt)
                ? target
                    .replace(/我们常常/g, "我们")
                    .replace(/很清楚/g, "清楚")
                    .replace(/有价值的/g, "有价值的")
                    .replace(/可以帮助我们/g, "能帮我们")
                : target.replace(/很清楚/g, "足够清楚").replace(/只是/g, "仅是");
        if (text === target)
            throw new Error("演示模式未找到可替换内容。可输入：把“原词”改成“新词”；自由修改请接入真实模型。");
        raw = "[1]\n" + text;
    }
    else {
        let text = requestMode === "outline"
            ? `围绕「${node.replace(/^\d+\s*/, "")}」，先写下一个具体的观察，再慢慢补充理由。不必急着完成整篇文章，让每个小段落都回应最初的想法。`
            : "也许，写作的起点就是给想法留一点空间。先把眼前这一小段写下来，再读一遍，看看它是否更接近自己真正想说的话。";
        if (requestMode === "continue" && visibleCount(text) > requestLimit) {
            text = [
                "先写下一点具体的观察，让想法有机会慢慢变得清楚。",
                "先把眼前的想法写下来。",
                "继续写。",
                "好。",
                "好",
            ].find((value) => visibleCount(value) <= requestLimit)!;
        }
        raw = "[1]\n" + text;
    }
    return raw;
}
export type ModelGeneration = {
    messages: {
        role: string;
        content: string;
    }[];
    selection: Config['selection'];
    reasoningEffort: ReasoningEffort;
    signal: AbortSignal;
};
export async function streamModelText(request: typeof fetch, { messages, selection, reasoningEffort, signal }: ModelGeneration, onChunk: (text: string) => void): Promise<string> {
    let raw = '';
    const response = await request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, selection, reasoningEffort }),
        signal: signal,
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
    }
    if (!response.body)
        throw new Error("模型响应没有可读取的内容。");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    // Parsing and consumer callbacks can fail while the network response is still open.
    const cancel = () => { void reader.cancel().catch(() => {}); };
    let buffer = "", done = false;
    const block = (text: string) => {
        const lines = text.split("\n");
        const event = lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
        const data = JSON.parse(lines
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5))
            .join("\n") || "null");
        if (event === "error")
            throw new Error(data);
        if (event === "done")
            done = true;
        if (event === "chunk") {
            raw += data;
            onChunk(raw);
        }
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
        if (signal.aborted)
            throw new DOMException("Stopped", "AbortError");
        while (true) {
            const { value, done: ended } = await reader.read();
            if (signal.aborted)
                throw new DOMException("Stopped", "AbortError");
            if (ended)
                break;
            buffer += decoder.decode(value, { stream: true });
            let i;
            while ((i = buffer.indexOf("\n\n")) >= 0) {
                block(buffer.slice(0, i));
                buffer = buffer.slice(i + 2);
            }
        }
        buffer += decoder.decode();
        if (buffer.trim())
            block(buffer);
        if (!done)
            throw new Error("响应中断，本次未生成可采纳建议。");
        return raw;
    } catch (error) {
        cancel();
        throw error;
    } finally {
        signal.removeEventListener("abort", cancel);
        reader.releaseLock();
    }
}
