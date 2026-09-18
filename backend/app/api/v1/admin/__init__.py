from fastapi import APIRouter

from app.api.v1.admin import attempts, certificates, devices, overview, workers

router = APIRouter(prefix="/admin")
router.include_router(overview.router)
router.include_router(workers.router)
router.include_router(attempts.router)
router.include_router(certificates.router)
router.include_router(devices.router)
