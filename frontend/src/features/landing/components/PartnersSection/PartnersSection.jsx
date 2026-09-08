import { useTranslation } from 'react-i18next';

import divaltoLogo from '../../../../assets/partners/divalto-logo.png';
import ttnLogo from '../../../../assets/partners/ttn-logo.png';
import wavesoftLogo from '../../../../assets/partners/wavesoft-logo.png';

const PARTNERS = [
  {
    id: 'divalto',
    name: 'Divalto',
    logo: divaltoLogo,
    className: 'divalto',
  },
  {
    id: 'ttn',
    name: 'Tunisie TradeNet',
    logo: ttnLogo,
    className: 'ttn',
  },
  {
    id: 'wavesoft',
    name: 'WaveSoft',
    logo: wavesoftLogo,
    className: 'wavesoft',
  },
];

function PartnersSection() {
  const { t } = useTranslation();

  const scrollingPartners = [
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
  ];

  return (
    <section
      id="integrations"
      className="moving-partners-section"
    >
      <div className="notion-shell">
        <div className="moving-partners-heading">

          <div>
          </div>
        </div>
      </div>

      <div className="moving-partners-marquee">
        <div
          className="moving-partners-fade moving-partners-fade-left"
          aria-hidden="true"
        />

        <div
          className="moving-partners-fade moving-partners-fade-right"
          aria-hidden="true"
        />

        <div className="moving-partners-track">
          {scrollingPartners.map(
            (partner, index) => (
              <div
                className={`moving-partner-item moving-partner-${partner.className}`}
                key={`${partner.id}-${index}`}
                aria-hidden={
                  index >= PARTNERS.length
                    ? 'true'
                    : undefined
                }
              >
                <img
                  src={partner.logo}
                  alt={
                    index < PARTNERS.length
                      ? `Logo ${partner.name}`
                      : ''
                  }
                />
              </div>
            )
          )}
        </div>
      </div>

      <div className="notion-shell">
        <p className="moving-partners-note">
          {t('partners.disclaimer', {
            defaultValue:
              '',
          })}
        </p>
      </div>
    </section>
  );
}

export default PartnersSection;