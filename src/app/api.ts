import { requestJson } from '../shared/api';
import { normalizeConfig, type Config } from '../features/settings/modelConfig';
// Application-specific response compatibility stays outside the shared JSON client.
export async function requestApi<T>(request: typeof fetch, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const data = await requestJson<unknown>(request, url, body, signal);
    const settingsMutation = url === '/model-services' || url === '/model-services/remove' || url === '/model-services/reorder';
    return (url === '/config' || settingsMutation ? normalizeConfig(data as Config) : data) as T;
}
