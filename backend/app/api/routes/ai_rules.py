from fastapi import APIRouter
from app.schemas.ai_rule import AiRuleParseRequest, AiRuleParseResponse
from app.services.ai_rule_parser import parse_natural_language_rule

router = APIRouter(prefix="/ai", tags=["AI Rule Builder"])


@router.post("/parse-rule", response_model=AiRuleParseResponse)
def parse_rule(payload: AiRuleParseRequest) -> AiRuleParseResponse:
    return parse_natural_language_rule(payload.text)
