# Quizzdex

Jogo de quiz/Pokedex em React + Vite, publicado na Netlify com Firebase Auth, Firestore e Netlify Functions.

## Seguranca do quiz

O front-end nao gera mais rodada localmente e nao recebe o ID/nome do Pokemon antes da resposta correta.

- `/.netlify/functions/getQuizRound` gera o desafio no servidor.
- `/.netlify/functions/quizImage` faz proxy da imagem para nao expor o ID no caminho da PokeAPI.
- `/.netlify/functions/validateQuizAnswer` valida a resposta no servidor.
- `QUIZ_SECRET` e obrigatorio no ambiente; nao use segredo padrao em producao.

## Configurar Firebase

1. Crie um projeto no Firebase.
2. Ative Authentication > Sign-in method > Google.
3. Adicione `quizzdex.netlify.app` em Authentication > Settings > Authorized domains.
4. Ative Firestore Database.
5. Publique as regras deste repo:

```bash
firebase deploy --only firestore:rules
```

6. Copie as configs Web App do Firebase para as variaveis `VITE_FIREBASE_*`.
7. Crie uma Service Account e coloque `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no Netlify.

## Variaveis no Netlify

Cadastre em Site configuration > Environment variables:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_ID=default
QUIZ_SECRET=uma-string-aleatoria-com-32-ou-mais-caracteres
FIREBASE_PROJECT_ID=...
FIREBASE_DATABASE_ID=default
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=cole_o_valor_private_key_do_json_da_service_account
```

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
