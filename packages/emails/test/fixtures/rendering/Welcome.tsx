export interface WelcomeProps {
  readonly name: string;
  readonly url: string;
}

export const Welcome = ({ name, url }: WelcomeProps) => (
  <html lang="en">
    <body>
      <p>Hello {name} 🌍</p>
      <a href={url}>Open your account</a>
      <p data-skip-in-text="true">HTML-only preview</p>
    </body>
  </html>
);
