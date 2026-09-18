from fastapi import APIRouter

from app.api.v1 import admin, devices, health, public, sync

router = APIRouter(prefix="/v1")
router.include_router(health.router)
router.include_router(devices.router)
router.include_router(sync.router)
router.include_router(public.router)
router.include_router(admin.router)
