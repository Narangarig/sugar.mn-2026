// Tailwind Play CDN config — shared by every page (loaded right after the CDN script).
tailwind.config = {
  theme: {
    extend: {
      colors: { primary: '#3BA73D' },
      fontFamily: {
        // Google Sans (loaded from Google Fonts in each page's <head>) is the default font
        sans: ['"Google Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
};
