import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  deleteNotification,
  formatNotificationDate,
  getNotifications,
  getNotificationVisualType,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../../services/notificationService';

import './NotificationBell.css';

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="notification-bell-icon"
    >
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M10 21h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M5 12.5 9.5 17 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M12 3 2.8 20h18.4L12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />

      <path
        d="M12 9v4m0 3h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <path
        d="m9 9 6 6m0-6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <path
        d="M12 11v5m0-8h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NotificationVisualIcon({
  type,
}) {
  if (
    type === 'success'
  ) {
    return <SuccessIcon />;
  }

  if (
    type === 'warning'
  ) {
    return <WarningIcon />;
  }

  if (
    type === 'error'
  ) {
    return <ErrorIcon />;
  }

  return <InfoIcon />;
}

function NotificationBell({
  pollInterval = 15000,
}) {
  const containerRef =
    useRef(null);

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    notifications,
    setNotifications,
  ] =
    useState([]);

  const [
    unreadCount,
    setUnreadCount,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    busyId,
    setBusyId,
  ] =
    useState(null);

  const [
    markAllLoading,
    setMarkAllLoading,
  ] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | LOAD COUNT
  |--------------------------------------------------------------------------
  */

  const loadUnreadCount =
    useCallback(
      async () => {
        try {
          const count =
            await getUnreadNotificationCount();

          setUnreadCount(
            count,
          );
        } catch (
          requestError
        ) {
          console.warn(
            'Notification count load failed:',
            requestError,
          );
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | LOAD NOTIFICATIONS
  |--------------------------------------------------------------------------
  */

  const loadNotifications =
    useCallback(
      async (
        showLoader = true,
      ) => {
        try {
          if (
            showLoader
          ) {
            setLoading(
              true,
            );
          }

          setError('');

          const response =
            await getNotifications({
              limit:
                30,
            });

          setNotifications(
            response.notifications,
          );

          const localUnreadCount =
            response.notifications.filter(
              (
                notification,
              ) =>
                notification
                  ?.isRead !==
                true,
            ).length;

          setUnreadCount(
            localUnreadCount,
          );
        } catch (
          requestError
        ) {
          setError(
            requestError.message ||
              'Impossible de charger les notifications.',
          );
        } finally {
          if (
            showLoader
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [],
    );

  /*
  |--------------------------------------------------------------------------
  | INITIAL LOAD
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    loadUnreadCount();
  }, [
    loadUnreadCount,
  ]);

  /*
  |--------------------------------------------------------------------------
  | POLLING
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      !pollInterval ||
      pollInterval < 5000
    ) {
      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          loadUnreadCount();

          if (open) {
            loadNotifications(
              false,
            );
          }
        },
        pollInterval,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    pollInterval,
    open,
    loadUnreadCount,
    loadNotifications,
  ]);

  /*
  |--------------------------------------------------------------------------
  | OPEN PANEL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [
    open,
    loadNotifications,
  ]);

  /*
  |--------------------------------------------------------------------------
  | CLICK OUTSIDE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    function handleClickOutside(
      event,
    ) {
      if (
        !containerRef.current
      ) {
        return;
      }

      if (
        !containerRef.current.contains(
          event.target,
        )
      ) {
        setOpen(
          false,
        );
      }
    }

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | ESCAPE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    function handleEscape(
      event,
    ) {
      if (
        event.key ===
        'Escape'
      ) {
        setOpen(
          false,
        );
      }
    }

    document.addEventListener(
      'keydown',
      handleEscape,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleEscape,
      );
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | OPEN NOTIFICATION
  |--------------------------------------------------------------------------
  */

  async function handleNotificationClick(
    notification,
  ) {
    if (
      !notification
    ) {
      return;
    }

    try {
      if (
        notification.isRead !==
        true
      ) {
        setBusyId(
          notification.id,
        );

        await markNotificationAsRead(
          notification.id,
        );

        setNotifications(
          (
            current,
          ) =>
            current.map(
              (
                item,
              ) =>
                item.id ===
                notification.id
                  ? {
                      ...item,
                      isRead:
                        true,
                    }
                  : item,
            ),
        );

        setUnreadCount(
          (
            current,
          ) =>
            Math.max(
              0,
              current - 1,
            ),
        );
      }

      if (
        notification.actionUrl
      ) {
        window.location.href =
          notification.actionUrl;
      }
    } catch (
      requestError
    ) {
      setError(
        requestError.message ||
          'Impossible de mettre à jour cette notification.',
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | MARK ALL
  |--------------------------------------------------------------------------
  */

  async function handleMarkAllAsRead() {
    if (
      unreadCount === 0
    ) {
      return;
    }

    try {
      setMarkAllLoading(
        true,
      );

      setError('');

      await markAllNotificationsAsRead();

      setNotifications(
        (
          current,
        ) =>
          current.map(
            (
              notification,
            ) => ({
              ...notification,
              isRead:
                true,
            }),
          ),
      );

      setUnreadCount(
        0,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError.message ||
          'Impossible de marquer les notifications comme lues.',
      );
    } finally {
      setMarkAllLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DELETE
  |--------------------------------------------------------------------------
  */

  async function handleDelete(
    event,
    notification,
  ) {
    event.stopPropagation();

    if (
      !notification?.id
    ) {
      return;
    }

    try {
      setBusyId(
        notification.id,
      );

      setError('');

      await deleteNotification(
        notification.id,
      );

      setNotifications(
        (
          current,
        ) =>
          current.filter(
            (
              item,
            ) =>
              item.id !==
              notification.id,
          ),
      );

      if (
        notification.isRead !==
        true
      ) {
        setUnreadCount(
          (
            current,
          ) =>
            Math.max(
              0,
              current - 1,
            ),
        );
      }
    } catch (
      requestError
    ) {
      setError(
        requestError.message ||
          'Impossible de supprimer la notification.',
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div
      className="notification-bell"
      ref={containerRef}
    >
      <button
        type="button"
        className={`notification-bell-trigger ${
          open
            ? 'notification-bell-trigger--active'
            : ''
        }`}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (
              current,
            ) =>
              !current,
          )
        }
      >
        <BellIcon />

        {unreadCount >
          0 && (
          <span className="notification-bell-badge">
            {unreadCount >
            99
              ? '99+'
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-panel">
          <header className="notification-panel-header">
            <div>
              <span className="notification-panel-eyebrow">
                Centre de notifications
              </span>

              <div className="notification-panel-title-row">
                <h2>
                  Notifications
                </h2>

                {unreadCount >
                  0 && (
                  <span className="notification-panel-unread-label">
                    {
                      unreadCount
                    }{' '}
                    non lue
                    {unreadCount >
                    1
                      ? 's'
                      : ''}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="notification-panel-close"
              aria-label="Fermer"
              onClick={() =>
                setOpen(
                  false,
                )
              }
            >
              <CloseIcon />
            </button>
          </header>

          <div className="notification-panel-toolbar">
            <button
              type="button"
              className="notification-panel-read-all"
              disabled={
                unreadCount ===
                  0 ||
                markAllLoading
              }
              onClick={
                handleMarkAllAsRead
              }
            >
              {markAllLoading
                ? 'Mise à jour...'
                : 'Tout marquer comme lu'}
            </button>

            <button
              type="button"
              className="notification-panel-refresh"
              onClick={() =>
                loadNotifications()
              }
            >
              Actualiser
            </button>
          </div>

          {error && (
            <div className="notification-panel-error">
              {error}
            </div>
          )}

          <div className="notification-panel-content">
            {loading ? (
              <div className="notification-panel-loading">
                <span className="notification-panel-spinner" />

                <p>
                  Chargement des notifications...
                </p>
              </div>
            ) : notifications.length ===
              0 ? (
              <div className="notification-panel-empty">
                <div className="notification-panel-empty-icon">
                  <BellIcon />
                </div>

                <strong>
                  Aucune notification
                </strong>

                <p>
                  Les informations importantes sur vos factures apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map(
                  (
                    notification,
                  ) => {
                    const visualType =
                      getNotificationVisualType(
                        notification,
                      );

                    const isBusy =
                      busyId ===
                      notification.id;

                    return (
                      <article
                        key={
                          notification.id
                        }
                        className={`notification-item notification-item--${visualType} ${
                          notification.isRead
                            ? 'notification-item--read'
                            : 'notification-item--unread'
                        } ${
                          isBusy
                            ? 'notification-item--busy'
                            : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          handleNotificationClick(
                            notification,
                          )
                        }
                        onKeyDown={(
                          event,
                        ) => {
                          if (
                            event.key ===
                              'Enter' ||
                            event.key ===
                              ' '
                          ) {
                            event.preventDefault();

                            handleNotificationClick(
                              notification,
                            );
                          }
                        }}
                      >
                        <div
                          className={`notification-item-icon notification-item-icon--${visualType}`}
                        >
                          <NotificationVisualIcon
                            type={
                              visualType
                            }
                          />
                        </div>

                        <div className="notification-item-content">
                          <div className="notification-item-top">
                            <strong className="notification-item-title">
                              {
                                notification.title
                              }
                            </strong>

                            {!notification.isRead && (
                              <span
                                className="notification-item-unread-dot"
                                title="Non lue"
                              />
                            )}
                          </div>

                          <p className="notification-item-message">
                            {
                              notification.message
                            }
                          </p>

                          <div className="notification-item-meta">
                            <span>
                              {formatNotificationDate(
                                notification.createdAt,
                              )}
                            </span>

                            {notification.meta
                              ?.stage && (
                              <>
                                <span className="notification-item-meta-separator">
                                  ·
                                </span>

                                <span className="notification-item-stage">
                                  {
                                    notification
                                      .meta
                                      .stage
                                  }
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="notification-item-delete"
                          aria-label="Supprimer la notification"
                          disabled={
                            isBusy
                          }
                          onClick={(
                            event,
                          ) =>
                            handleDelete(
                              event,
                              notification,
                            )
                          }
                        >
                          <TrashIcon />
                        </button>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </div>

          <footer className="notification-panel-footer">
            <span className="notification-panel-live-dot" />

            <span>
              Mise à jour automatique toutes les{' '}
              {Math.round(
                pollInterval /
                  1000,
              )}{' '}
              secondes
            </span>
          </footer>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;