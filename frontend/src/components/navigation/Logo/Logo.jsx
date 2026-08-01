import logoDark from "../../../assets/logo-dark.png";
import logoLight from "../../../assets/logo-light.png";

export default function Logo() {
  return (
    <span className="public-header__logo-container">
      <img
        src={logoDark}
        alt="Tenor Afrique"
        className="
          public-header__logo-image
          public-header__logo-dark
        "
      />

      <img
        src={logoLight}
        alt="Tenor Afrique"
        className="
          public-header__logo-image
          public-header__logo-light
        "
      />
    </span>
  );
}