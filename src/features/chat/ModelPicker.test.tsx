import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelDocumentContext } from '../../shared/panelDocument';
import { initialConfig, type Config } from '../settings/modelConfig';
import ModelPicker from './ModelPicker';

function renderTrigger(config: Config) {
  const panelDocument = { hidden: false } as Document;
  return renderToStaticMarkup(
    <PanelDocumentContext.Provider value={panelDocument}>
      <ModelPicker config={config} disabled={false} onModelChange={() => {}} />
    </PanelDocumentContext.Provider>,
  );
}

const selected: Config = {
  ...initialConfig,
  demo: false,
  selection: { serviceId: 'local', modelId: 'plain' },
  services: [{
    id: 'local', name: '本地服务', endpoint: '', enabled: true, hasKey: false,
    models: [
      { id: 'plain', name: '普通模型' },
      { id: 'adjustable', name: '推理模型', manualReasoningLevels: ['low', 'high'] },
    ],
  }],
};

describe('model picker trigger', () => {
  it('asks for a model when no model is selected', () => {
    const trigger = renderTrigger(initialConfig);
    expect(trigger).toContain('title="选择模型"');
    expect(trigger).toContain('aria-label="选择模型"');
  });

  it('identifies a model without reasoning controls by name', () => {
    const trigger = renderTrigger(selected);
    expect(trigger).toContain('title="本地服务 · 普通模型"');
    expect(trigger).toContain('aria-label="选择模型：本地服务 · 普通模型"');
    expect(trigger).not.toContain('model-picker-meter');
  });

  it('reports the active reasoning setting for an adjustable model', () => {
    const trigger = renderTrigger({ ...selected, selection: { serviceId: 'local', modelId: 'adjustable' } });
    expect(trigger).toContain('title="本地服务 · 推理模型 · 推理强度：服务默认"');
    expect(trigger).toContain('aria-label="选择模型 · 推理强度：服务默认"');
    expect(trigger).toContain('model-picker-meter');
  });
});
