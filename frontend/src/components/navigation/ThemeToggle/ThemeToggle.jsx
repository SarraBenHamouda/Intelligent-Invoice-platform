import { useEffect, useState } from 'react';

function getInitialTheme() {
  const savedTheme =
    localStorage.getItem('theme');

  if (
    savedTheme === 'light' ||
    savedTheme === 'dark'
  ) {
    return savedTheme;
  }

  return window.matchMedia(
    '(prefers-color-scheme: dark)'
  ).matches
    ? 'dark'
    : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] =
    useState(getInitialTheme);

  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      theme
    );

    localStorage.setItem(
      'theme',
      theme
    );
  }, [theme]);

  function toggleTheme() {
    setTheme(
      isDark ? 'light' : 'dark'
    );
  }

  return (
    <button
      type="button"
      className={`theme-switch ${
        isDark ? 'is-dark' : 'is-light'
      }`}
      onClick={toggleTheme}
      aria-label={
        isDark
          ? 'Activer le mode jour'
          : 'Activer le mode nuit'
      }
      title={
        isDark
          ? 'Mode jour'
          : 'Mode nuit'
      }
    >
      <span
        className="theme-switch-icon theme-switch-moon"
        aria-hidden="true"
      >
        🌙
      </span>

      <span
        className="theme-switch-icon theme-switch-sun"
        aria-hidden="true"
      >
        ☀️
      </span>

      <span
        className="theme-switch-thumb"
        aria-hidden="true"
      />
    </button>
  );
}

export default ThemeToggle;