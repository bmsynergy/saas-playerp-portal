import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../../src/locales';
import { PrintListPagination, usePrintListPagination } from '../../src/components/PrintListPagination';
function Fixture() {
  const pagination = usePrintListPagination(133);
  const picker = usePrintListPagination(133);
  return <LocaleProvider>
    <header style={{ height: 400 }}>Outer section</header>
    <section><h2>Deployment</h2><div style={{ height: 500 }}>Other deployment information</div>
      <div data-pagination-list="nested"/>
      <ol>{Array.from({ length: pagination.end - pagination.start }, (_, i) => <li key={pagination.start + i} style={{ height: 70 }}>Row {pagination.start + i + 1}</li>)}</ol>
      <PrintListPagination id="nested" pagination={pagination}/>
      <div style={{ height: 500 }}>Nested device picker</div>
      <ol data-pagination-list="picker" style={{ height: 300, overflowY: 'auto' }}>
        {Array.from({ length: picker.end - picker.start }, (_, i) => <li key={i} style={{ height: 70 }}>Device {picker.start + i + 1}</li>)}
      </ol>
      <PrintListPagination id="picker" pagination={picker}/>
    </section>
    <footer style={{ height: 800 }}>Remaining page content</footer>
  </LocaleProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
