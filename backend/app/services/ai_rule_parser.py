import json
from fastapi import HTTPException, status
from openai import OpenAI
from app.core.config import get_settings
from app.schemas.ai_rule import AiRuleParseResponse

SYSTEM_PROMPT = """You are a strict e-commerce discount rule parser for an Indian INR discount engine.
Convert the natural language rule into a JSON object matching the schema.
Rules:
- scope must be "brand", "platform", or "cart".
- discount_type must be "percentage" or "flat".
- Percentage must be > 0 and <= 100. Flat must be > 0.
- stackable is true only if explicitly stated as stackable/combinable.
- min_cart_value is required and positive when scope is "cart", otherwise null.
- Never invent missing values. If ambiguous or incomplete, set is_valid=false and provide a clear clarification_message."""


def parse_natural_language_rule(text: str) -> AiRuleParseResponse:
    settings = get_settings()
    if not settings.openai_api_key or settings.openai_api_key == "your_openai_api_key":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENAI_API_KEY is not configured on the backend server.",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "discount_rule_parse",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "scope": {"type": ["string", "null"], "enum": ["brand", "platform", "cart", None]},
                        "applies_to": {"type": ["string", "null"]},
                        "discount_type": {"type": ["string", "null"], "enum": ["percentage", "flat", None]},
                        "value": {"type": ["number", "null"]},
                        "stackable": {"type": "boolean"},
                        "min_cart_value": {"type": ["number", "null"]},
                        "is_valid": {"type": "boolean"},
                        "clarification_message": {"type": ["string", "null"]},
                    },
                    "required": [
                        "scope",
                        "applies_to",
                        "discount_type",
                        "value",
                        "stackable",
                        "min_cart_value",
                        "is_valid",
                        "clarification_message",
                    ],
                },
            },
        },
    )

    content = completion.choices[0].message.content
    if not content:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Empty response from OpenAI API.")

    raw = json.loads(content)
    return AiRuleParseResponse.model_validate(raw)
