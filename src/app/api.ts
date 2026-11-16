import { requestJson } from '../shared/api';
import { normalizeConfig, type Config } from '../features/settings/modelConfig';
// Application-specific response compatibility stays outside the shared JSON client.
export async function requestApi<T>(request: typeof fetch, url: string, body?: unknown): Promise<T> {
    const data = await requestJson<unknown>(request, url, body);
    return (url === '/config' || url.startsWith('/model-services') ? normalizeConfig(data as Config) : data) as T;
}
