from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    """docs/06: the body of every error response."""

    error: ErrorBody
