from fastapi import APIRouter

from app.api.v1.admin import certificates, devices

router = APIRouter(prefix="/admin")
router.include_router(certificates.router)
router.include_router(devices.router)
