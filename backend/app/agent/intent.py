from __future__ import annotations

import re

from app.models import InboxMessage, IntentResult
from app.services.llm import llm_client
from app.tools.common import infer_issue_type


REPLIES = {
    "normal_statement": "Got it. Is there anything about your stay you'd like help with?",
    "small_talk": "Hello! How can I help you with your stay today?",
    "question": (
        "Happy to help. Our front desk team can confirm details like that right away — "
        "and if anything in your room needs attention, just tell me the room number and the issue."
    ),
    "missing_details": "I can help with that. What room are you in, and what seems to be wrong?",
    "handoff_request": "Of course — I'm connecting you with a member of our team now.",
}

SMALL_TALK_RE = re.compile(
    r"^\s*(hi|hello|hey|howdy|good\s+(morning|afternoon|evening))(\s+there)?\s*[!,.?]*\s*$",
    re.IGNORECASE,
)
ACK_RE = re.compile(
    r"^\s*(ok(ay)?|thanks|thank\s+you( so much| very much)?|great|perfect|sounds\s+good|got\s+it|"
    r"no\s+thanks|that'?s\s+all|bye|goodbye|cool|alright|all\s+right|nice|no,?\s*that'?s\s+(all|it))"
    r"([\s!,.]*(ok(ay)?|thanks|thank\s+you|great|bye|goodbye))*\s*[!,.]*\s*$",
    re.IGNORECASE,
)
HANDOFF_RE = re.compile(
    r"(connect\s+me|transfer\s+me|put\s+me\s+through|speak\s+(to|with)|talk\s+(to|with))"
    r".*\b(person|human|manager|agent|someone|front\s*desk|staff|representative)\b"
    r"|real\s+person|a\s+human\b|\bhuman\s+(please|agent)\b",
    re.IGNORECASE,
)
COMPLAINT_RE = re.compile(
    r"\b(broken|not\s+working|doesn'?t\s+work|stopped\s+working|won'?t\s+(turn|work|open|lock|flush)|"
    r"leak(ing|ed)?|mold|moldy|dirty|filthy|stain(ed)?|smell(s|y|ed)?|stink(s|y)?|noisy?|loud|"
    r"no\s+hot\s+water|no\s+(water|power|internet|wifi|heat)|freezing|too\s+(hot|cold)|unbearabl\w+|"
    r"refund|compensat\w+|complain\w*|unacceptable|terrible|awful|horrible|disgusting|"
    r"bugs?|cockroach\w*|bed\s*bugs?|stolen|locked\s+out)\b",
    re.IGNORECASE,
)
VAGUE_PROBLEM_RE = re.compile(
    r"\b(problem|issue|something(\s+is|'s)?\s+(wrong|off|not\s+right)|wrong\s+with|not\s+right)\b",
    re.IGNORECASE,
)
QUESTION_START_RE = re.compile(
    r"^\s*(what|when|where|who|why|how|can|could|do|does|is|are|may|will|would|should)\b",
    re.IGNORECASE,
)


def classify_intent(message: InboxMessage) -> IntentResult:
    text = f"{message.subject} {message.body}".strip()
    body = message.body.strip()

    rule_result = _rule_intent(body if body else text)
    if rule_result is not None:
        return _normalize(rule_result)

    if llm_client.live:
        result = llm_client.chat_json(
            [
                {
                    "role": "system",
                    "content": (
                        "You route messages for a hotel AI concierge. Classify the guest's message. "
                        "Return strict JSON: {\"intent\": one of [\"complaint\",\"missing_details\","
                        "\"normal_statement\",\"question\",\"small_talk\",\"handoff_request\"], "
                        "\"confidence\": 0..1, \"should_run_case\": bool, \"reply\": short conversational "
                        "reply to send if this is not a complaint, \"reason\": short justification}. "
                        "Use \"complaint\" only when the guest reports a concrete hotel issue worth "
                        "investigating. Use \"missing_details\" when they hint at a problem but give "
                        "too little to investigate."
                    ),
                },
                {"role": "user", "content": message.model_dump_json()},
            ],
            IntentResult,
            fallback=lambda: _heuristic_default(body if body else text).model_dump(),
        )
        return _normalize(result)

    return _normalize(_heuristic_default(body if body else text))


def _rule_intent(text: str) -> IntentResult | None:
    if HANDOFF_RE.search(text):
        return IntentResult(
            intent="handoff_request",
            confidence=0.95,
            should_run_case=False,
            reason="Guest explicitly asked for a human.",
        )
    if ACK_RE.match(text):
        return IntentResult(
            intent="normal_statement",
            confidence=0.95,
            should_run_case=False,
            reason="Short acknowledgement with no hotel issue.",
        )
    if SMALL_TALK_RE.match(text):
        return IntentResult(
            intent="small_talk",
            confidence=0.95,
            should_run_case=False,
            reason="Greeting with no hotel issue.",
        )
    has_complaint_signal = bool(COMPLAINT_RE.search(text)) or infer_issue_type(text) != "guest_relations"
    if has_complaint_signal:
        return IntentResult(
            intent="complaint",
            confidence=0.9,
            should_run_case=True,
            reason="Message reports a concrete hotel issue.",
        )
    if VAGUE_PROBLEM_RE.search(text):
        return IntentResult(
            intent="missing_details",
            confidence=0.8,
            should_run_case=False,
            reason="Guest hints at a problem but gives too little to investigate.",
        )
    if text.rstrip().endswith("?") or QUESTION_START_RE.match(text):
        return IntentResult(
            intent="question",
            confidence=0.75,
            should_run_case=False,
            reason="General question, not a complaint.",
        )
    return None


def _heuristic_default(text: str) -> IntentResult:
    return IntentResult(
        intent="normal_statement",
        confidence=0.5,
        should_run_case=False,
        reason="No complaint signal detected; treating as a normal statement.",
    )


def _normalize(result: IntentResult) -> IntentResult:
    # Only genuine complaints may start the investigation pipeline, whatever the LLM claimed.
    result.should_run_case = result.intent == "complaint"
    if not result.should_run_case and not result.reply:
        result.reply = REPLIES.get(result.intent, REPLIES["normal_statement"])
    return result


def status_for_intent(intent: str) -> str:
    if intent == "missing_details":
        return "needs_clarification"
    if intent == "handoff_request":
        return "routed_to_human"
    return "ignored"
