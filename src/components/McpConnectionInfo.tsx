import { useState } from 'react';
import { Check, Copy, PlugZap } from 'lucide-react';
import { useLocale } from '../locales';

type McpConnectionInfoProps = { endpoint: string | null; entorno: string | null };

export function McpConnectionInfo({ endpoint, entorno }: McpConnectionInfoProps) {
  const { t } = useLocale();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copy = async () => {
    if (!endpoint) return;
    try { await navigator.clipboard.writeText(endpoint); setCopyState('copied'); }
    catch { setCopyState('error'); }
  };
  return <section className="mcp-editor-card mcp-connection-info" aria-labelledby="mcp-connection-title">
    <div className="section-heading"><div><p className="eyebrow">{t('mcp.integrationsEyebrow')}</p><h4 id="mcp-connection-title">{t('mcp.connectionTitle')}</h4></div><span className="section-icon"><PlugZap size={20} aria-hidden="true" /></span></div>
    <p className="mcp-muted">{t('mcp.connectionHelp')}</p>
    <div className="mcp-connection-endpoint"><span>{t('mcp.endpoint')}{entorno ? ` (${entorno})` : ''}</span>
      {endpoint ? <><strong className="ps-mono mcp-endpoint" data-testid="mcp-endpoint">{endpoint}</strong><button type="button" className="button button-secondary mcp-copy" onClick={() => void copy()}>{copyState === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{t(copyState === 'copied' ? 'mcp.copied' : copyState === 'error' ? 'mcp.copyFailed' : 'mcp.copy')}</button><span className="mcp-sr-only" role="status">{copyState === 'copied' ? t('mcp.copied') : copyState === 'error' ? t('mcp.copyFailed') : ''}</span></> : <strong>{t('notProvided')}</strong>}
    </div>
    <h5>{t('mcp.stepsTitle')}</h5>
    <ol className="mcp-steps"><li>{t('mcp.step1')}</li><li>{t('mcp.step2')}</li><li>{t('mcp.step3')}</li><li>{t('mcp.step4')}</li></ol>
  </section>;
}
