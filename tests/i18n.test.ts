import { describe, expect, it, vi } from 'vitest';
import { scanSource, dictionaryProblems, audit } from '../scripts/check-i18n.mjs';
import { setupFileSize } from '../src/lib/psSetup';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { PsLinkError, psLinkErrorText } from '../src/lib/psLink';

describe('sustainable EN/ES interface audit', () => {
  it('keeps the portal dictionaries and reviewed interface literal inventory clean', () => {
    const result = audit();
    expect(result.problems).toEqual([]);
    expect(result.findings).toEqual([]);
  }, 30000);
  it('rejects missing or empty translations and mismatched interpolation parameters', () => {
    expect(dictionaryProblems({ save: 'Save', count: '{n} devices' }, { count: '{total} aparatos', extra: 'Extra' })).toHaveLength(3);
    expect(dictionaryProblems({save:'Save'},{save:''})).toEqual(['main: empty save']);
  });
  it('detects new visible literals, accessible labels, metadata, inline language branches and messages', () => {
    const result = scanSource(`
      const options = [{label:'Open archive'}];
      const text = locale === 'es' ? 'Guardar' : 'Save';
      setError('Could not save');
      const view = <><button aria-label="Close dialog">Save changes</button><input placeholder={'Search devices'}/><span>{ok ? 'Ready' : 'Pending'}</span></>;
    `);
    expect(result.findings.map((f: {text:string}) => f.text)).toEqual(expect.arrayContaining(['Open archive','Guardar','Save','Could not save','Close dialog','Save changes','Search devices','Ready','Pending']));
  });
  it('detects browser dialogs and dialog body props including spread metadata', () => {
    const result = scanSource(`window.confirm("Delete account?"); window.alert("Saved"); globalThis.alert("Done"); const x={body:"Review changes"}; const view=<><Dialog body="Confirm deletion"/><Dialog {...x}/></>;`);
    expect(result.findings.map((f:{text:string})=>f.text)).toEqual(expect.arrayContaining(['Delete account?', 'Saved', 'Done', 'Review changes', 'Confirm deletion']));
  });
  it('does not confuse identifiers, classes, routes or user data with interface copy', () => {
    expect(scanSource(`const x=<a href="/admin/staff" className={locale === 'es' ? 'selected' : ''} data-testid="staff-row">{member.full_name}{t('staff.nav')}</a>; const code=locale==='es'?'es-ES':'en-US';`).findings).toEqual([]);
  });
  it('finds direct and conditional translation references for missing-key validation', () => {
    expect(scanSource(`const x=t(ok?'save':'missing.key'); t('other.missing');`).keys.map((k:{key:string})=>k.key)).toEqual(['save','missing.key','other.missing']);
  });
  it('rejects freezing translated feedback in state but accepts a localized-key fallback', () => {
    expect(scanSource(`setNotice(t('saved')); setResult({ok:true,text:t('done')});`).findings.filter((f:{kind:string})=>f.kind.startsWith('translated copy'))).toHaveLength(2);
    expect(scanSource(`setNotice(t(key)===key?'genericError':key);`).findings.filter((f:{kind:string})=>f.kind.startsWith('translated copy'))).toHaveLength(0);
  });
  it('formats installation file sizes with the active language', () => {
    expect(setupFileSize(1572864,'—','en')).toBe('1.5 MB');
    expect(setupFileSize(1572864,'—','es')).toBe('1,5 MB');
  });
  it('translates a known backend error in both languages and gives unknown codes a local fallback', () => {
    for (const dict of [en,es]) {
      const t = (key:string) => dict[key as keyof typeof en] ?? key;
      expect(psLinkErrorText(new PsLinkError('device_assigned_elsewhere','RAW_BACKEND_COPY','move'),t,'fallback')).toBe(`${t('psLink.error.device_assigned_elsewhere')} ${t('psLink.next.move')}`);
      expect(psLinkErrorText(new PsLinkError('future_code','RAW_BACKEND_COPY',null),t,'fallback')).toBe(t('psLink.error.other'));
    }
  });
});
