# Quizzdex

Jogo de quiz/Pokedex em React + Vite, publicado na Netlify com Supabase Auth, Postgres e Netlify Functions.

## Seguranca do quiz

O front-end nao gera mais rodada localmente e nao recebe o ID/nome do Pokemon antes da resposta correta.

- `/.netlify/functions/getQuizRound` gera o desafio no servidor.
- `/.netlify/functions/quizImage` gera a silhueta no servidor.
- `/.netlify/functions/validateQuizAnswer` valida a resposta no servidor.
- `QUIZ_SECRET` e obrigatorio no ambiente; nao use segredo padrao em producao.

## Configurar Supabase

1. Crie um projeto no Supabase.
2. Em SQL Editor, rode o arquivo `supabase/schema.sql`.
3. Em Authentication > Providers, habilite Google se quiser login social.
4. Em Authentication > URL Configuration, adicione `https://quizzdex.netlify.app` nos redirect URLs.
5. Copie `Project URL`, `anon public key` e `service_role key`.

## Variaveis no Netlify

Cadastre em Project configuration > Environment variables:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
QUIZ_SECRET=uma-string-aleatoria-com-32-ou-mais-caracteres
```

`SUPABASE_SERVICE_ROLE_KEY` e segredo de servidor: nunca use no front-end e nunca commite.

## Desenvolvimento

```bash
npm install
npm run dev
```

Use `npm run dev` para passar pelas Netlify Functions. `npm run dev:vite` roda apenas o Vite e o quiz seguro nao vai funcionar sem as rotas `/.netlify/functions`.

## Build

```bash
npm run build
```
