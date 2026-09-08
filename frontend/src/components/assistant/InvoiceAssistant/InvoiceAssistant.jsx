import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  askInvoiceAssistant,
} from '../../../services/assistantService';

import './InvoiceAssistant.css';

const DEFAULT_SUGGESTIONS = [
  'Quel est le statut de la facture 10000005 ?',
  'Pourquoi la facture 10000005 a échoué ?',
  'Que signifie PENDING_REVIEW ?',
  'Comment relancer une facture ERP ?',
];

function createMessage(
  author,
  text,
  extra = {},
) {
  return {
    id:
      `${Date.now()}-${Math.random()}`,

    author,

    text,

    ...extra,
  };
}

function InvoiceAssistant() {
  const navigate =
    useNavigate();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    input,
    setInput,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    suggestions,
    setSuggestions,
  ] =
    useState(
      DEFAULT_SUGGESTIONS,
    );

  const [
    messages,
    setMessages,
  ] =
    useState([
      {
        id:
          'welcome',

        author:
          'assistant',

        text:
          'Bonjour 👋 Je peux vous aider à suivre vos factures, comprendre un statut ou une erreur et vous expliquer comment effectuer une relance.',
      },
    ]);

  const messagesEndRef =
    useRef(null);

  const inputRef =
    useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer =
      setTimeout(
        () => {
          inputRef.current?.focus();
        },
        100,
      );

    return () =>
      clearTimeout(
        timer,
      );
  }, [
    open,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior:
        'smooth',
    });
  }, [
    messages,
    loading,
    open,
  ]);

  async function sendMessage(
    rawMessage,
  ) {
    const message =
      String(
        rawMessage || '',
      ).trim();

    if (
      !message ||
      loading
    ) {
      return;
    }

    setMessages(
      (current) => [
        ...current,

        createMessage(
          'user',
          message,
        ),
      ],
    );

    setInput('');
    setLoading(true);

    try {
      const result =
        await askInvoiceAssistant(
          message,
        );

      setMessages(
        (current) => [
          ...current,

          createMessage(
            'assistant',

            result?.answer ||
              'Je n’ai pas trouvé de réponse.',

            {
              invoice:
                result?.invoice ||
                null,

              actionUrl:
                result?.action_url ||
                null,
            },
          ),
        ],
      );

      if (
        Array.isArray(
          result?.suggestions,
        ) &&
        result.suggestions.length
      ) {
        setSuggestions(
          result.suggestions.slice(
            0,
            4,
          ),
        );
      }
    } catch (
      error
    ) {
      setMessages(
        (current) => [
          ...current,

          createMessage(
            'assistant',

            error?.message ||
              'Assistant momentanément indisponible.',

            {
              error:
                true,
            },
          ),
        ],
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(
    event,
  ) {
    event.preventDefault();

    sendMessage(
      input,
    );
  }

  return (
    <>
      <button
        type="button"
        className="invoice-assistant-launcher"
        onClick={() =>
          setOpen(
            (value) =>
              !value,
          )
        }
      >
        <span className="invoice-assistant-launcher__emoji">
          🤖
        </span>

        <strong>
          Assistant
        </strong>
      </button>

      {open && (
        <section className="invoice-assistant-panel">
          <header className="invoice-assistant-header">
            <div>
              <span className="invoice-assistant-header__emoji">
                🤖
              </span>

              <div>
                <strong>
                  Assistant factures
                </strong>

                <small>
                  Aide au suivi
                </small>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setOpen(
                  false,
                )
              }
            >
              ×
            </button>
          </header>

          <div className="invoice-assistant-messages">
            {messages.map(
              (
                message,
              ) => (
                <div
                  key={
                    message.id
                  }
                  className={`invoice-assistant-message invoice-assistant-message--${message.author}`}
                >
                  <div
                    className={
                      message.error
                        ? 'invoice-assistant-bubble invoice-assistant-bubble--error'
                        : 'invoice-assistant-bubble'
                    }
                  >
                    {
                      message.text
                    }
                  </div>

                  {message.invoice && (
                    <div className="invoice-assistant-card">
                      <div>
                        <small>
                          Facture
                        </small>

                        <strong>
                          {
                            message
                              .invoice
                              .invoice_number
                          }
                        </strong>
                      </div>

                      <div>
                        <small>
                          Statut
                        </small>

                        <strong>
                          {
                            message
                              .invoice
                              .status
                          }
                        </strong>
                      </div>

                      <div>
                        <small>
                          Étape
                        </small>

                        <strong>
                          {
                            message
                              .invoice
                              .current_stage ||
                            '—'
                          }
                        </strong>
                      </div>

                      {message.actionUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(
                              false,
                            );

                            navigate(
                              message.actionUrl,
                            );
                          }}
                        >
                          Ouvrir la facture →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}

            {loading && (
              <div className="invoice-assistant-message invoice-assistant-message--assistant">
                <div className="invoice-assistant-bubble">
                  Réflexion…
                </div>
              </div>
            )}

            <div
              ref={
                messagesEndRef
              }
            />
          </div>

          <div className="invoice-assistant-suggestions">
            {suggestions
              .slice(
                0,
                3,
              )
              .map(
                (
                  suggestion,
                ) => (
                  <button
                    key={
                      suggestion
                    }
                    type="button"
                    onClick={() =>
                      sendMessage(
                        suggestion,
                      )
                    }
                    disabled={
                      loading
                    }
                  >
                    {
                      suggestion
                    }
                  </button>
                ),
              )}
          </div>

          <form
            className="invoice-assistant-form"
            onSubmit={
              handleSubmit
            }
          >
            <input
              ref={
                inputRef
              }
              type="text"
              value={
                input
              }
              placeholder="Posez une question…"
              maxLength={
                500
              }
              disabled={
                loading
              }
              onChange={(
                event,
              ) =>
                setInput(
                  event.target
                    .value,
                )
              }
            />

            <button
              type="submit"
              disabled={
                loading ||
                !input.trim()
              }
            >
              →
            </button>
          </form>

          <footer>
            Réponses basées sur les données du portail
          </footer>
        </section>
      )}
    </>
  );
}

export default InvoiceAssistant;