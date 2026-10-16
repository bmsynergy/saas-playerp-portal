import { useState } from 'react';
import { Bot, Check, Copy, ListChecks, PlugZap } from 'lucide-react';
import { useLocale } from '../locales';
import type { McpEditorProps } from '../lib/mcp';
import { McpVenueEditor } from '../components/McpVenueEditor';

// PE-458: Integrations / AI-MCP section of one venue, for its owners only (mcp_integracion_estado answers 42501
// otherwise). Only the MCP clients the backend publishes as checked are listed, labelled as clients: no providers,
// models or names that merely appear in the OAuth catalog.
export function IntegrationsMcpSection(props: McpEditorProps) {
  const { data } = props;
  const { t } = useLocale();
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    if (!data.endpoint) return;
    try { await navigator.clipboard.writeText(data.endpoint); setCopied(true); } catch { setCopied(false); }
  };
  return <div className="page-stack owner-integrations" data-testid="owner-integrations">
    <section className="owner-venue-card" aria-label={t('mcp.configuration')}><McpVenueEditor {...props} /></section>
    <section className="owner-venue-card" aria-labelledby="mcp-integration-title">
      <div className="owner-venue-top"><div><p className="eyebrow">{t('mcp.integrationsEyebrow')}</p><h2 id="mcp-integration-title">{t('mcp.integrationsTitle')}</h2><p className="owner-section-lead">{t('mcp.integrationsLead')}</p></div></div>
      <div className="owner-dashboard-facts">
        <div><span>{t('mcp.endpoint')}{data.entorno ? ` (${data.entorno})` : ''}</span>
          {data.endpoint ? <strong className="ps-mono mcp-endpoint" data-testid="mcp-endpoint">{data.endpoint}</strong> : <strong>{t('notProvided')}</strong>}
          {data.endpoint && <button type="button" className="button button-secondary mcp-copy" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>}{t(copied ? 'mcp.copied' : copied === false ? 'mcp.copyFailed' : 'mcp.copy')}</button>}
        </div>
      </div>
    </section>
    <section className="owner-venue-card" aria-labelledby="mcp-steps-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.stepsEyebrow')}</p><h2 id="mcp-steps-title">{t('mcp.stepsTitle')}</h2></div><span className="section-icon"><PlugZap size={20}/></span></div>
      <ol className="mcp-steps">
        <li>{t('mcp.step1')}</li>
        <li>{t('mcp.step2')}</li>
        <li>{t('mcp.step3')}</li>
        <li>{t('mcp.step4')}</li>
      </ol>
    </section>
    <section className="owner-venue-card" aria-labelledby="mcp-clients-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.clientsEyebrow')}</p><h2 id="mcp-clients-title">{t('mcp.clientsTitle')}</h2></div><span className="section-icon"><ListChecks size={20}/></span></div>
      <p className="owner-section-lead">{t('mcp.clientsLead')}</p>
      {data.clientes.length ? <ul className="mcp-clients" data-testid="mcp-clients">{data.clientes.map(c => <li key={c.nombre}><Bot size={16}/><strong>{c.nombre}</strong><small>{t('mcp.clientKind')}</small></li>)}</ul>
        : <div className="inline-empty">{t('mcp.noClients')}</div>}
      <p className="mcp-muted">{t('mcp.clientsNote')}</p>
    </section>
  </div>;
}
