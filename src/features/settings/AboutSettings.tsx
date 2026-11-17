import {useEffect, useRef, useState} from 'react';
import type {AboutInfo} from '../../shared/buildInfo';
import {browserAboutInfo, copyAboutDiagnostic, diagnosticPreview, openAboutDataDirectory, readDesktopAboutInfo} from './aboutInfo';
import helpText from '../../../docs/help.md?raw';
import changelogText from '../../../docs/CHANGELOG.md?raw';
import licenseText from '../../../LICENSE?raw';
import './about.css';

const modeLabels: Record<AboutInfo['runtime']['mode'], string> = {
  'desktop-development': '桌面开发运行', 'desktop-package': '桌面应用包',
  'browser-development': '浏览器开发运行', 'browser-build': '浏览器本地构建',
};
const displayBuildValue = (value: string) => !value || value === 'unavailable' ? '未记录' : value;

export default function AboutSettings() {
  const bridge = window.hiveDesktop?.isDesktop ? window.hiveDesktop : undefined;
  const desktop = !!bridge;
  const build = __HIVE_BUILD_INFO__;
  const [info, setInfo] = useState<AboutInfo | null>(() => desktop ? null : browserAboutInfo(build, import.meta.env.DEV, navigator.platform));
  const [loading, setLoading] = useState(desktop);
  const [feedback, setFeedback] = useState('');
  const [copying, setCopying] = useState(false);
  const [opening, setOpening] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (bridge) {
      void readDesktopAboutInfo(bridge).then(value => {
        if (alive.current) { setInfo(value); setLoading(false); }
      });
    }
    return () => { alive.current = false; };
  }, [bridge]);
  const metadata = info || build;
  const missingBuildRecord = !loading && [metadata.buildNumber, metadata.buildTime, metadata.channel].some(value => !value || value === 'unavailable');
  const preview = diagnosticPreview(build, info, desktop);

  async function copy() {
    setCopying(true); setFeedback('');
    const result = await copyAboutDiagnostic(preview, navigator.clipboard);
    if (!alive.current) return;
    setCopying(false);
    setFeedback(result === 'copied' ? '已复制上方预览中的诊断信息。' : result === 'unavailable'
      ? '当前环境不支持剪贴板，请手动选择上方预览并复制。' : '复制失败，请手动选择上方预览并复制。');
  }
  async function openDirectory() {
    if (!bridge) return;
    setOpening(true); setFeedback('');
    const opened = await openAboutDataDirectory(bridge);
    if (!alive.current) return;
    setOpening(false); setFeedback(opened ? '已请求打开应用数据目录。' : '无法打开应用数据目录，请稍后重试。');
  }

  return <div className="about-settings">
    <section className="settings-card about-metadata" aria-labelledby="about-version-title">
      <h2 id="about-version-title">{metadata.appName}</h2>
      <p className="about-mode">{loading ? '正在读取桌面运行信息…' : info ? modeLabels[info.runtime.mode] : '桌面运行信息暂不可用'}</p>
      {!loading && desktop && !info && <p role="alert">无法读取桌面信息。下方版本与构建来自当前页面的构建元数据，不能据此确认桌面应用包；诊断中的运行环境留空。</p>}
      {missingBuildRecord && <p role="status">构建记录缺失或与应用版本不一致，无法确认该构建。</p>}
      <dl>
        <div><dt>版本</dt><dd>{metadata.version}</dd></div>
        <div><dt>构建编号</dt><dd>{displayBuildValue(metadata.buildNumber)}</dd></div>
        <div><dt>构建时间（UTC）</dt><dd>{displayBuildValue(metadata.buildTime)}</dd></div>
        <div><dt>发行渠道</dt><dd>{displayBuildValue(metadata.channel)}</dd></div>
        <div><dt>信息来源</dt><dd>{info && desktop ? '桌面应用' : desktop ? '页面构建元数据（回退）' : '页面构建元数据'}</dd></div>
        {info && <><div><dt>平台 / 架构</dt><dd>{info.runtime.platform} / {info.runtime.arch}</dd></div>
          {info.runtime.electron && <div><dt>Electron</dt><dd>{info.runtime.electron}</dd></div>}
          {info.runtime.chrome && <div><dt>Chromium</dt><dd>{info.runtime.chrome}</dd></div>}
          {info.runtime.node && <div><dt>Node.js</dt><dd>{info.runtime.node}</dd></div>}</>}
      </dl>
      <p>当前没有在线更新服务。后续更新由统一发布提供，请以所用构建的版本与渠道为准。</p>
    </section>
    <section className="settings-card about-documents" aria-labelledby="about-documents-title">
      <h2 id="about-documents-title">离线资料</h2>
      <p>在此展开阅读，不会离开当前写作会话。</p>
      {[['使用帮助', helpText], ['更新日志', changelogText], ['许可证 · AGPL-3.0-or-later', licenseText]].map(([title, text]) =>
        <details key={title}><summary>{title}</summary><pre tabIndex={0} aria-label={title}>{text}</pre></details>)}
    </section>
    <section className="settings-card about-diagnostics" aria-labelledby="about-diagnostics-title">
      <h2 id="about-diagnostics-title">诊断信息</h2>
      <p>复制内容与下方预览一致，仅包含版本、构建与运行环境。不读取正文、聊天、模型配置、密钥或本机完整路径。</p>
      <pre tabIndex={0} aria-label="诊断信息预览">{preview}</pre>
      <div className="about-actions">
        <button type="button" className="settings-secondary" disabled={loading || copying} onClick={() => void copy()}>{copying ? '正在复制…' : '复制诊断信息'}</button>
        {desktop && <button type="button" className="settings-secondary" disabled={opening} onClick={() => void openDirectory()}>{opening ? '正在打开…' : '打开应用数据目录'}</button>}
      </div>
      {!desktop && <p>应用数据目录仅在桌面版中可打开。</p>}
      {feedback && <p role="status" aria-live="polite" className="about-feedback">{feedback}</p>}
    </section>
  </div>;
}
