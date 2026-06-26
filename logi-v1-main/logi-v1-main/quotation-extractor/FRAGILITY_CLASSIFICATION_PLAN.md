# Fragility Classification - Integration Plan

## Overview

We have Adobe PDF Extract API working. Now we need an intelligence layer to classify products as **fragile** or **not fragile** for logistics planning.

---

## Why OpenAI API?

| Approach | Pros | Cons |
|----------|------|------|
| **Hardcoded rules** | Fast, free | Limited, can't handle new products |
| **Keyword matching** | Simple | Misses context, many false positives |
| **OpenAI API** | Understands context, handles any product | Cost per request, latency |

**Recommendation:** OpenAI API - it can understand "FORNO VETRO NERO" means "glass oven" = fragile, without us coding every possible product.

---

## Architecture

```
PDF → Adobe Extract → Raw Tables → OpenAI Classification → Tagged Items
                                          ↓
                                   { fragile: true/false,
                                     reason: "glass component",
                                     confidence: 0.95 }
```

---

## Step-by-Step Integration

### Step 1: Get OpenAI API Key

1. Go to https://platform.openai.com/
2. Create account or login
3. Go to API Keys section
4. Create new secret key
5. Copy the key (starts with `sk-`)

### Step 2: Add Environment Variable

Add to `.env.local`:
```
OPENAI_API_KEY=sk-your-key-here
```

### Step 3: Install OpenAI SDK

```bash
npm install openai
```

### Step 4: Create Classification Service

Create new file: `lib/classify-fragility.ts`

**Purpose:** Takes product description, returns fragility classification

**Input:**
```typescript
{
  code: "EFOR60",
  description: "FORNO VETRO NERO 60 SERIE 4",
  dimensions: { L: 600, H: 450, P: 550 }
}
```

**Output:**
```typescript
{
  fragile: true,
  reason: "Contains glass door (VETRO)",
  confidence: 0.95,
  category: "appliance",
  stackable: false,
  max_weight_on_top_kg: 0
}
```

### Step 5: Design the Prompt

**System Prompt:**
```
You are a logistics expert classifying kitchen furniture and appliances for transport.

For each item, determine:
1. Is it FRAGILE? (glass, electronics, delicate surfaces)
2. Can items be STACKED on top of it?
3. What is the maximum weight it can support on top?

Consider:
- VETRO/CRISTALLO = glass = fragile
- FORNO/MICROONDE = oven = fragile (glass door)
- PIANO COTTURA = cooktop = fragile (glass/ceramic surface)
- FRIGORIFERO = refrigerator = fragile (compressor, shelves)
- LAVASTOVIGLIE = dishwasher = fragile (electronics)
- BASE/PENSILE = cabinet = usually NOT fragile, CAN support weight
- TOP LAMINATO = laminate top = NOT fragile
- TOP MARMO/QUARZO = stone top = FRAGILE (can crack)

Return JSON only.
```

**User Prompt:**
```
Classify this product:
Code: {code}
Description: {description}
Dimensions: {L}x{H}x{P} mm
```

### Step 6: API Call Structure

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",  // Fast & cheap for classification
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Classify: ${description}` }
  ],
  response_format: { type: "json_object" },
  temperature: 0.1,  // Low = consistent results
  max_tokens: 200
});
```

### Step 7: Batch Processing

Don't call API for each item individually (slow + expensive).

**Better approach:**
```typescript
// Send multiple items in one request
const prompt = `Classify these ${items.length} products:
${items.map((item, i) => `${i+1}. ${item.code}: ${item.description}`).join('\n')}

Return JSON array with classification for each.`;
```

**Batch size:** 10-20 items per request

### Step 8: Caching Layer

Many quotations have the same products. Cache results:

```typescript
// Simple in-memory cache
const fragilityCache = new Map<string, FragilityResult>();

function getFragility(code: string, description: string) {
  const cacheKey = `${code}_${description}`;

  if (fragilityCache.has(cacheKey)) {
    return fragilityCache.get(cacheKey);
  }

  const result = await classifyWithOpenAI(code, description);
  fragilityCache.set(cacheKey, result);
  return result;
}
```

**Future:** Store in database for persistence across restarts.

---

## Cost Estimation

| Model | Cost per 1M tokens | Avg tokens per item | Cost per 100 items |
|-------|-------------------|--------------------|--------------------|
| gpt-4o-mini | $0.15 input / $0.60 output | ~100 input, ~50 output | ~$0.015 |
| gpt-4o | $2.50 input / $10.00 output | ~100 input, ~50 output | ~$0.30 |

**Recommendation:** Use `gpt-4o-mini` for classification - it's smart enough for this task and 20x cheaper.

---

## Response Schema

```typescript
interface FragilityClassification {
  fragile: boolean;
  fragility_reason: string | null;
  confidence: number;  // 0.0 to 1.0

  // For 3D loading
  stackable: boolean;           // Can this go on top of other items?
  supports_weight: boolean;     // Can other items go on top of this?
  max_weight_on_top_kg: number; // If supports_weight, how much?

  // Category
  category: "appliance" | "cabinet" | "top" | "accessory" | "panel";

  // Special handling
  orientation_matters: boolean;  // Must stay upright?
  requires_padding: boolean;     // Needs extra protection?
}
```

---

## Integration Points

### Option A: Classify on Extract

```
Upload PDF → Extract → Classify ALL items → Return enriched data
```

**Pros:** Single request, complete data
**Cons:** Slower response (waits for OpenAI)

### Option B: Classify on Demand

```
Upload PDF → Extract → Return basic data
Click "Classify" → Send to OpenAI → Update UI
```

**Pros:** Fast initial response, user controls when to classify
**Cons:** Extra click, two-step process

### Option C: Background Classification

```
Upload PDF → Extract → Return basic data immediately
               ↓
         Background job → Classify → WebSocket/polling update
```

**Pros:** Best UX, non-blocking
**Cons:** More complex to implement

**Recommendation for MVP:** Option A (simplest)

---

## File Structure

```
lib/
├── adobe-extract.ts      # Existing - PDF extraction
├── parse-quotation.ts    # Existing - Data parsing
├── classify-fragility.ts # NEW - OpenAI classification
└── openai-client.ts      # NEW - OpenAI SDK setup

types/
└── quotation.ts          # Add FragilityClassification interface
```

---

## Error Handling

```typescript
try {
  const result = await classifyWithOpenAI(items);
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Wait and retry
    await sleep(1000);
    return classifyWithOpenAI(items);
  }

  if (error.code === 'insufficient_quota') {
    // Fallback to rule-based classification
    return classifyWithRules(items);
  }

  // Default: mark as unknown, flag for manual review
  return items.map(item => ({
    ...item,
    fragile: null,
    fragility_reason: "Classification failed - manual review needed"
  }));
}
```

---

## Fallback Rules (No API)

If OpenAI fails, use keyword matching:

```typescript
const FRAGILE_KEYWORDS = [
  "vetro", "cristallo", "glass",
  "forno", "oven",
  "microonde", "microwave",
  "piano cottura", "cooktop",
  "frigorifero", "frigo", "refrigerator",
  "lavastoviglie", "dishwasher",
  "marmo", "marble",
  "quarzo", "quartz",
  "ceramica", "ceramic"
];

const NOT_FRAGILE_KEYWORDS = [
  "base", "pensile", "cabinet",
  "cassetto", "drawer",
  "anta", "door",
  "laminato", "laminate",
  "mensola", "shelf"
];
```

---

## Testing Strategy

1. **Unit test the prompt** - Test with known products
2. **Verify consistency** - Same product should always get same result
3. **Edge cases:**
   - Products with mixed materials ("BASE CON TOP VETRO")
   - Unknown products
   - Products in different languages

---

## Next Steps

1. [ ] Get OpenAI API key
2. [ ] Add to `.env.local`
3. [ ] Install `openai` package
4. [ ] Create `lib/openai-client.ts`
5. [ ] Create `lib/classify-fragility.ts`
6. [ ] Add types to `types/quotation.ts`
7. [ ] Integrate into extraction flow
8. [ ] Add caching
9. [ ] Test with real quotations
10. [ ] Add fallback rules

---

## Questions to Answer Before Implementation

1. **Classify all items or just line items?** (skip RAEE, summary tables?)
2. **Store classifications in database?** (for reuse across quotations)
3. **Allow manual override?** (user can mark item as fragile/not fragile)
4. **Show confidence score to user?** (or just yes/no?)
