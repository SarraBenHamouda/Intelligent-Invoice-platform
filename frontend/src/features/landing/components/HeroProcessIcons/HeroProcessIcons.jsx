import { useTranslation } from 'react-i18next';

const SIGNATURE_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3e%3cpath stroke='%23664FC2' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m18 13-1.3-6.498c-.072-.363-.108-.545-.197-.692a1 1 0 0 0-.312-.325c-.144-.094-.324-.138-.684-.225L2 2m0 0 3.26 13.507c.087.36.13.54.225.684a1 1 0 0 0 .325.312c.147.088.329.125.692.197L13 18M2 2l7.586 7.586m6.545 11.283 4.738-4.738c.396-.396.594-.594.668-.822a1 1 0 0 0 0-.618c-.074-.228-.272-.426-.668-.822l-.738-.738c-.396-.396-.594-.594-.822-.668a1 1 0 0 0-.618 0c-.228.074-.426.272-.822.668L13.13 17.87c-.396.396-.594.594-.668.822a1 1 0 0 0 0 .618c.074.228.272.426.668.822l.738.738c.396.396.594.594.822.668a1 1 0 0 0 .618 0c.228-.074.426-.272.822-.668ZM13 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0'/%3e%3c/svg%3e";

const USERS_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' fill='%23664FC2' viewBox='0 0 16 16'%3e%3cpath d='M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4'/%3e%3c/svg%3e";

const ERP_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3e%3cpath fill='%23664FC2' d='M21 7h-6a1 1 0 0 0-1 1v3h-2V4a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1M8 6h2v2H8zM6 16H4v-2h2zm0-4H4v-2h2zm0-4H4V6h2zm4 8H8v-2h2zm0-4H8v-2h2zm9 4h-2v-2h2zm0-4h-2v-2h2z'/%3e%3c/svg%3e";

const DOCUMENT_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' data-name='Layer 1' viewBox='0 0 24 24'%3e%3cpath fill='none' stroke='%23664FC2' stroke-miterlimit='10' stroke-width='1.5' d='M15.82 13.91Zm4.77-7.64V22.5H3.41v-21h12.41z'/%3e%3cpath fill='none' stroke='%23664FC2' stroke-miterlimit='10' stroke-width='1.5' d='M20.59 6.27v.96h-5.73V1.5h.96z'/%3e%3c/svg%3e";

const VALIDATION_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' data-name='Layer 1' viewBox='0 0 24 24'%3e%3cpath fill='none' stroke='%23664FC2' stroke-miterlimit='10' stroke-width='1.5' d='M16.75 20.59v1.91H1.48v-21h15.27v11.46'/%3e%3cpath fill='none' stroke='%23664FC2' stroke-linecap='square' stroke-miterlimit='10' stroke-width='1.5' d='M13.89 7.23zm0 3.82z'/%3e%3cpath fill='none' stroke='%23664FC2' stroke-miterlimit='10' stroke-width='1.5' d='M5.29 19.64v-.96l1.92-2.86.95 2.86 1.91-.95.95.95h2.87m2.86 0h-.96v-.95l4.78-4.77.95.95z'/%3e%3c/svg%3e";

const TRANSMISSION_ICON =
  "data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3e%3cpath stroke='%23664FC2' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M7 12h5v5m-8.99-5H3m5.01 5H8m4.01 4H12m9.01-9H21M3 17h1.5m11-5h2M3 21h5m4-19v6m5.6 13h1.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C21 20.24 21 19.96 21 19.4v-1.8c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C20.24 16 19.96 16 19.4 16h-1.8c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C16 16.76 16 17.04 16 17.6v1.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C16.76 21 17.04 21 17.6 21m0-13h1.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C21 7.24 21 6.96 21 6.4V4.6c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C20.24 3 19.96 3 19.4 3h-1.8c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C16 3.76 16 4.04 16 4.6v1.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C16.76 8 17.04 8 17.6 8m-13 0h1.8c.56 0 .84 0 1.054-.109a1 1 0 0 0 .437-.437C8 7.24 8 6.96 8 6.4V4.6c0-.56 0-.84-.109-1.054a1 1 0 0 0-.437-.437C7.24 3 6.96 3 6.4 3H4.6c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C3 3.76 3 4.04 3 4.6v1.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C3.76 8 4.04 8 4.6 8'/%3e%3c/svg%3e";

const PROCESS_ITEMS = [
  {
    id: 'document',
    icon: DOCUMENT_ICON,
    label: 'Facture PDF',
    className: 'process-icon-blue',
  },
  {
    id: 'erp',
    icon: ERP_ICON,
    label: 'ERP',
    className: 'process-icon-yellow',
  },
  {
    id: 'users',
    icon: USERS_ICON,
    label: 'Client et fournisseur',
    className: 'process-icon-red',
  },
  {
    id: 'validation',
    icon: VALIDATION_ICON,
    label: 'Validation',
    className: 'process-icon-green',
  },
  {
    id: 'signature',
    icon: SIGNATURE_ICON,
    label: 'Signature XAdES',
    className: 'process-icon-purple',
  },
  {
    id: 'transmission',
    icon: TRANSMISSION_ICON,
    label: 'Transmission TTN',
    className: 'process-icon-cyan',
  },
];

function HeroProcessIcons() {
  const { t } = useTranslation();

  return (
    <div className="notion-process-icons">
      <div className="notion-process-icons-row">
        {PROCESS_ITEMS.map((item, index) => (
          <div
            key={item.id}
            className="notion-process-item"
            style={{
              '--process-index': index,
            }}
          >
            <div
              className={`notion-process-circle ${item.className}`}
            >
              <img
                src={item.icon}
                alt=""
                className="notion-process-svg"
                aria-hidden="true"
              />
            </div>

            <span className="notion-process-tooltip">
              {t(
                `hero.processIcons.${item.id}`,
                {
                  defaultValue: item.label,
                }
              )}
            </span>
          </div>
        ))}
      </div>

      <div
        className="notion-process-decoration"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default HeroProcessIcons;