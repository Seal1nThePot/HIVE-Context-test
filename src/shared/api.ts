export type ApiClient = <T>(url: string, body?: unknown) => Promise<T>;
export async function requestJson<T>(request: typeof fetch, url: string, body?: unknown): Promise<T> {
    const response = await request("/api" + url, body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || "本地服务响应异常。");
    return data as T;
}
