This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AI Configuration

This app uses AI to generate 3D furniture models from images. You can choose between OpenAI (GPT-4o) or Google Gemini as the AI provider.

### Environment Variables

Create a `.env.local` file in the project root with:

```bash
# Choose your AI provider: "openai" or "gemini" (default: gemini)
AI_PROVIDER=openai

# API Keys (only the key for your selected provider is required)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | `"openai"` or `"gemini"` (default: `gemini`) |
| `OPENAI_API_KEY` | Required when `AI_PROVIDER=openai` |
| `GEMINI_API_KEY` | Required when `AI_PROVIDER=gemini` |

If no API keys are configured, the app will use a mock response for development.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
