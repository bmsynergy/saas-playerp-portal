import { ListChecks } from 'lucide-react';
import { useLocale } from '../locales';
import type { McpEditorProps } from '../lib/mcp';
import { McpVenueEditor } from '../components/McpVenueEditor';

const confirmedClients = [
  { name: 'ChatGPT', logo: '/brand/ai-clients/chatgpt.svg' },
  { name: 'Claude', logo: '/brand/ai-clients/claude.svg' },
  { name: 'Grok', logo: '/brand/ai-clients/grok.svg' },
  { name: 'Gemini', logo: '/brand/ai-clients/gemini.svg' },
] as const;

export function IntegrationsMcpSection(props: McpEditorProps) {
  const { t } = useLocale();
  return <div className="page-stack owner-integrations" data-testid="owner-integrations">
    <section className="owner-venue-card" aria-label={t('mcp.configuration')}><McpVenueEditor {...props} /></section>
    <section className="owner-venue-card mcp-clients-card" aria-labelledby="mcp-clients-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.clientsEyebrow')}</p><h2 id="mcp-clients-title">{t('mcp.clientsTitle')}</h2></div><span className="section-icon"><ListChecks size={20} aria-hidden="true" /></span></div>
      <p className="owner-section-lead">{t('mcp.clientsLead')}</p>
      <ul className="mcp-clients" data-testid="mcp-clients">{confirmedClients.map(client => <li key={client.name}><img src={client.logo} alt="" width="24" height="24" /><strong>{client.name}</strong><small>{t('mcp.clientKind')}</small></li>)}</ul>
      <p className="mcp-muted">{t('mcp.clientsNote')}</p>
    </section>
  </div>;
}
