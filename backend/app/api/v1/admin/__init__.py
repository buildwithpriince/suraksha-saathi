from fastapi import APIRouter

from app.api.v1.admin import devices

router = APIRouter(prefix="/admin")
router.include_router(devices.router)
