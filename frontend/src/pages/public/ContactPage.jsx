import {
  useState,
} from 'react';

import './styles/ContactPage.css';

const CONTACT_SUBJECTS = [
  {
    value: 'demo',
    label: 'Demande de démonstration',
  },
  {
    value: 'integration',
    label: 'Intégration ERP',
  },
  {
    value: 'signature',
    label: 'Signature électronique',
  },
  {
    value: 'ttn',
    label: 'Transmission TTN',
  },
  {
    value: 'support',
    label: 'Support technique',
  },
  {
    value: 'other',
    label: 'Autre demande',
  },
];

function ContactPage() {
  const [submitted, setSubmitted] =
    useState(false);

  const [formData, setFormData] =
    useState({
      name: '',
      email: '',
      company: '',
      subject: 'demo',
      message: '',
    });

  function handleChange(event) {
    const {
      name,
      value,
    } = event.target;

    setFormData((currentData) => ({
      ...currentData,
      [name]: value,
    }));

    if (submitted) {
      setSubmitted(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    setSubmitted(true);
  }

  return (
    <main className="contact-page">
      <section className="contact-hero">
        <div className="contact-hero-decoration contact-hero-decoration-one" />
        <div className="contact-hero-decoration contact-hero-decoration-two" />

        <div className="contact-container contact-hero-content">
          <span className="contact-label">
            Contact
          </span>

          <h1>
            Parlons de votre projet de
            facturation électronique
          </h1>

          <p>
            Notre équipe vous accompagne dans
            l’extraction, la validation, la
            signature électronique et la
            transmission de vos factures vers
            TTN.
          </p>

          <div className="contact-hero-points">
            <span>
              Réponse personnalisée
            </span>

            <span>
              Analyse de votre besoin
            </span>

            <span>
              Accompagnement technique
            </span>
          </div>
        </div>
      </section>

      <section className="contact-main-section">
        <div className="contact-container contact-layout">
          <aside className="contact-sidebar">
            <div className="contact-sidebar-header">
              <span className="contact-sidebar-badge">
                Tenor Afrique
              </span>

              <h2>
                Nous sommes à votre écoute
              </h2>

              <p>
                Décrivez votre besoin et notre
                équipe reviendra vers vous avec
                une réponse adaptée à votre
                contexte.
              </p>
            </div>

            <div className="contact-details">
              <a
                className="contact-detail-card"
                href="mailto:contact@tenorafrique.com"
              >
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  ✉
                </span>

                <span className="contact-detail-content">
                  <small>
                    E-mail
                  </small>

                  <strong>
                    contact@tenorafrique.com
                  </strong>
                </span>

                <span
                  className="contact-detail-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </a>

              <div className="contact-detail-card">
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  ◉
                </span>

                <span className="contact-detail-content">
                  <small>
                    Localisation
                  </small>

                  <strong>
                    Tunis, Tunisie
                  </strong>
                </span>
              </div>

              <div className="contact-detail-card">
                <span
                  className="contact-detail-icon"
                  aria-hidden="true"
                >
                  ◷
                </span>

                <span className="contact-detail-content">
                  <small>
                    Temps de réponse
                  </small>

                  <strong>
                    Sous 24 à 48 heures
                  </strong>
                </span>
              </div>
            </div>

            <div className="contact-trust-card">
              <span
                className="contact-trust-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <div>
                <strong>
                  Vos informations restent
                  confidentielles
                </strong>

                <p>
                  Elles sont utilisées uniquement
                  pour répondre à votre demande.
                </p>
              </div>
            </div>
          </aside>

          <div className="contact-form-card">
            <div className="contact-form-heading">
              <div>
                <span className="contact-form-label">
                  Votre demande
                </span>

                <h2>
                  Envoyez-nous un message
                </h2>
              </div>

              <span className="contact-form-status">
                Équipe disponible
              </span>
            </div>

            <form
              className="contact-form"
              onSubmit={handleSubmit}
            >
              <div className="contact-form-row">
                <div className="contact-form-group">
                  <label htmlFor="contact-name">
                    Nom complet
                  </label>

                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Votre nom"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-email">
                    Adresse e-mail
                  </label>

                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="nom@entreprise.tn"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="contact-form-row">
                <div className="contact-form-group">
                  <label htmlFor="contact-company">
                    Entreprise
                  </label>

                  <input
                    id="contact-company"
                    name="company"
                    type="text"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Nom de votre entreprise"
                    autoComplete="organization"
                  />
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-subject">
                    Sujet
                  </label>

                  <select
                    id="contact-subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                  >
                    {CONTACT_SUBJECTS.map(
                      (subject) => (
                        <option
                          key={subject.value}
                          value={subject.value}
                        >
                          {subject.label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="contact-form-group">
                <label htmlFor="contact-message">
                  Message
                </label>

                <textarea
                  id="contact-message"
                  name="message"
                  rows="7"
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Décrivez votre projet, votre besoin ou les difficultés rencontrées..."
                  required
                />

                <span className="contact-character-count">
                  {formData.message.length}
                  {' '}
                  caractères
                </span>
              </div>

              {submitted && (
                <div
                  className="contact-success-message"
                  role="status"
                >
                  <span aria-hidden="true">
                    ✓
                  </span>

                  <div>
                    <strong>
                      Votre message a été préparé
                    </strong>

                    <p>
                      La connexion au service
                      d’envoi d’e-mails sera ajoutée
                      ultérieurement.
                    </p>
                  </div>
                </div>
              )}

              <div className="contact-form-footer">
                <p>
                  En envoyant ce formulaire, vous
                  acceptez d’être contacté au sujet
                  de votre demande.
                </p>

                <button
                  type="submit"
                  className="contact-submit-button"
                >
                  <span>
                    Envoyer le message
                  </span>

                  <span aria-hidden="true">
                    →
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ContactPage;