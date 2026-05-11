# Lead Hunter (Fase 1)

Sistema interno de prospecção B2B com scraping no Google Maps, validação de celulares brasileiros e envio para webhook.

## Como rodar

```bash
npm install
npm run dev
```

Aplicação disponível em `http://localhost:3000`.

## Configuração do `.env.local`

```env
WEBHOOK_URL=
SCRAPER_MAX_RESULTS=30
```

- `WEBHOOK_URL`: endpoint externo para receber os leads processados.
- `SCRAPER_MAX_RESULTS`: limite máximo de resultados lidos no feed do Google Maps por busca.

## Limitações conhecidas

- O Google Maps altera seletores com frequência, podendo quebrar o scraping.
- É necessário executar `npx playwright install` (ou `npx playwright install chromium`) no ambiente.
- A rota usa timeout de até 5 minutos (`maxDuration = 300`) para buscas maiores.

## Próximos passos (Fase 2)

- Implementar rate limiting para proteger a rota e o alvo de scraping.
- Adicionar fila assíncrona com BullMQ para processar lotes de buscas.
- Incluir deduplicação de leads por telefone normalizado.
