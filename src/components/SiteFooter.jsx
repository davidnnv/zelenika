import { Link } from 'react-router-dom';
import { useLang } from '../lang';
import { BUSINESS } from '../lib/config';
import InstallButton from './InstallButton';
import { A } from '../lib/asset';

export default function SiteFooter() {
  const { t, lang } = useLang();
  return (
    <footer className="ftr">
      <div className="ftr__in">
        <img className="ftr__logo" src={A('brand/logo-light.png')} width="606" height="926" alt="Zelenika Beer Garden" loading="lazy" />
        <div>
          <h3>{t.footer.where}</h3>
          <p>{BUSINESS.address[lang]}</p>
          <p><a href={BUSINESS.maps} target="_blank" rel="noopener noreferrer">{t.hero.maps}</a></p>
        </div>
        <div>
          <h3>{t.footer.contact}</h3>
          <p><a href={`tel:${BUSINESS.phone}`}>{BUSINESS.phoneIntl}</a></p>
          <p><a href={`mailto:${BUSINESS.email}`} translate="no">{BUSINESS.email}</a></p>
        </div>
        <div>
          <h3>{t.footer.open}</h3>
          <p className="pre">{t.footer.openText}</p>
          <p><InstallButton /></p>
        </div>
      </div>
      <div className="ftr__bar">
        <span translate="no">© Zelenika Beer Garden</span>
        <Link to="/admin" rel="nofollow">{t.footer.admin}</Link>
      </div>
    </footer>
  );
}
