# Summarizer model options

## Decision for Phase 1

Use Cloudflare Workers AI `@cf/meta/llama-3.2-1b-instruct` as the primary summarizer and retain the built-in extractive summarizer as the automatic fallback. Llama 3.2 1B is explicitly documented for summarization tasks and is considerably lighter than the previously considered BART options.

Source: https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/

## Models evaluated

### Cloudflare Workers AI BART Large CNN

Cloudflare hosts? No: the model `@cf/facebook/bart-large-cnn` is now marked deprecated. It was attractive because inference ran beside the Worker, but a new implementation should not depend on a deprecated model.

Source: https://developers.cloudflare.com/workers-ai/models/bart-large-cnn/

### Fine-tuned T5 Small

`Falconsai/text_summarization` is a 60.5-million-parameter T5-small checkpoint specifically fine-tuned for summarization. It is much smaller than BART variants, but still requires a compatible inference runtime and hundreds of megabytes of weights in common formats. It is a reasonable future model for a small external CPU service, not for bundling directly into a Cloudflare Worker.

Source: https://huggingface.co/Falconsai/text_summarization

### DistilBART CNN

`sshleifer/distilbart-cnn-12-6` is trained for news-style summarization, but has 306 million parameters. Even smaller DistilBART variants listed on its model card contain roughly 230 million parameters. That is unnecessarily heavy for summarizing short RSS excerpts.

Source: https://huggingface.co/sshleifer/distilbart-cnn-12-6

### Base T5 Small

Google's T5 Small has approximately 60 million parameters and supports text-to-text tasks, including summarization. A summarization-fine-tuned checkpoint is preferable to the base checkpoint for this use case.

Source: https://huggingface.co/google-t5/t5-small

## Recommended progression

1. Use Workers AI for the highest-ranked stories.
2. Fall back automatically when AI is disabled, unavailable, over quota, or returns invalid output.
3. Only self-host T5 Small or another compact checkpoint if API cost, privacy, or provider portability becomes a demonstrated problem.

Kaggle is useful for discovering and experimenting with model checkpoints in notebooks. It does not solve continuous production inference: NewsFellow would still need a runtime hosted somewhere, and that host would become the primary cost and operations burden.
