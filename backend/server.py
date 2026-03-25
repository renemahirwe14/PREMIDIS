from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date
from jose import JWTError, jwt
from passlib.context import CryptContext
from enum import Enum
import mammoth
import io
import re
import asyncio
import fitz  # PyMuPDF
import base64
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'premidis-secret-key-2025')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 480

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI(title="PREMIDIS SARL - HR Platform", version="2.0.0")

# Will be defined later after database helpers
_leave_reminder_task = None

async def start_background_tasks():
    """Start background tasks after app startup"""
    global _leave_reminder_task
    
    async def daily_leave_reminder_loop():
        """Background task that runs daily to send leave reminders"""
        while True:
            try:
                # Wait until 8 AM tomorrow
                now = datetime.now(timezone.utc)
                tomorrow_8am = (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
                wait_seconds = (tomorrow_8am - now).total_seconds()
                
                logging.info(f"Next leave reminder scheduled in {wait_seconds/3600:.1f} hours")
                await asyncio.sleep(wait_seconds)
                
                # Send reminders - function will be defined later in the file
                await send_leave_reminders_background()
                logging.info("Daily leave reminders sent successfully")
            except Exception as e:
                logging.error(f"Error in daily leave reminder task: {e}")
                await asyncio.sleep(3600)  # Wait 1 hour before retry
    
    _leave_reminder_task = asyncio.create_task(daily_leave_reminder_loop())
    logging.info("Leave reminder scheduler started")

@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    await start_background_tasks()

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    global _leave_reminder_task
    if _leave_reminder_task:
        _leave_reminder_task.cancel()
        logging.info("Leave reminder scheduler stopped")

# ==================== ENUMS ====================
class UserRole(str, Enum):
    ADMIN = "admin"
    SECRETARY = "secretary"
    EMPLOYEE = "employee"

class LeaveStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class LeaveType(str, Enum):
    ANNUAL = "annual"           # Congé annuel
    SICK = "sick"               # Congé maladie
    EXCEPTIONAL = "exceptional" # Autorisation exceptionnelle
    MATERNITY = "maternity"     # Congé maternité
    PUBLIC = "public"           # Jours fériés

class EmployeeCategory(str, Enum):
    CADRE = "cadre"
    AGENT = "agent"
    STAGIAIRE = "stagiaire"

class Department(str, Enum):
    MARKETING = "marketing"
    COMPTABILITE = "comptabilite"
    ADMINISTRATION = "administration"
    RH = "ressources_humaines"
    JURIDIQUE = "juridique"
    SECURITE = "securite"
    TECHNIQUE = "technique"
    CHAUFFEUR = "chauffeur"

# ==================== MODELS ====================
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    department: str = "administration"
    role: str = "employee"
    category: str = "agent"
    position: str = ""
    phone: Optional[str] = None
    hire_date: Optional[str] = None
    salary: Optional[float] = None
    salary_currency: Optional[str] = "USD"  # USD or FC
    site_id: Optional[str] = None
    hierarchy_level: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    department: str
    category: Optional[str] = "agent"
    position: Optional[str] = None
    phone: Optional[str] = None
    hire_date: Optional[str] = None
    salary: Optional[float] = None
    salary_currency: Optional[str] = "USD"
    birth_date: Optional[str] = None
    hierarchy_level: Optional[str] = None
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    hierarchical_group_id: Optional[str] = None
    hierarchical_group_name: Optional[str] = None
    is_active: bool = True
    created_at: Optional[str] = None
    avatar_url: Optional[str] = None
    leave_balance: Optional[Dict[str, int]] = None
    leave_taken: Optional[Dict[str, int]] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LeaveRuleConfig(BaseModel):
    annual_days: int = 26          # Congé annuel par défaut (individuel: 4 jours minimum)
    sick_days: int = 2             # Congé maladie (ex: 2 jours)
    exceptional_days: int = 15     # Autorisation exceptionnelle (ex: 15 jours)
    maternity_days: int = 90       # Congé maternité (3 mois)
    paternity_days: int = 10       # Congé paternité
    public_holidays: int = 12      # Jours fériés par an (configurable)

class LeaveRequest(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str
    employee_id: Optional[str] = None  # For admin/secretary to request for others
    for_all_employees: bool = False    # For public holidays - apply to all

class LeaveUpdate(BaseModel):
    status: Optional[str] = None  # approved, rejected, pending
    admin_comment: Optional[str] = None

class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    category: Optional[str] = None
    salary: Optional[float] = None
    salary_currency: Optional[str] = None
    hire_date: Optional[str] = None
    site_id: Optional[str] = None
    hierarchical_group_id: Optional[str] = None
    birth_date: Optional[str] = None
    hierarchy_level: Optional[str] = None

class SalaryAdvance(BaseModel):
    employee_id: str
    amount: float
    reason: str
    repayment_date: str

class Bonus(BaseModel):
    employee_id: str
    amount: float
    reason: str
    date: str

class ExitAuthorization(BaseModel):
    employee_id: str
    date: str
    departure_time: str
    return_time: Optional[str] = None
    reason: str

class BehaviorNote(BaseModel):
    employee_id: str
    type: str  # 'sanction', 'warning', 'dismissal', 'praise', etc.
    note: str
    date: str
    file_name: Optional[str] = None  # Nom du fichier (ex: "Lettre_renvoi_123.pdf")
    file_url: Optional[str] = None   # URL ou chemin du fichier
    document_urls: Optional[List[str]] = []  # Support pour plusieurs documents (legacy)

class AttendanceCreate(BaseModel):
    employee_id: str
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    notes: Optional[str] = ""

# ==================== NOTIFICATION MODELS ====================
class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str  # 'info', 'warning', 'success', 'error', 'custom'
    target_users: List[str]  # Liste des user IDs ou 'all_admins', 'all_users'
    link: Optional[str] = None  # Lien optionnel vers une page
    
class NotificationTemplate(BaseModel):
    name: str
    title_template: str  # "{{employee_name}} s'est connecté"
    message_template: str
    type: str
    trigger_event: str  # 'login', 'leave_request', 'leave_reminder', 'custom'
    target_role: Optional[str] = None  # 'admin', 'all', etc.
    is_active: bool = True

# ==================== DOCUMENTS RH MODELS ====================
class DocumentTemplate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str  # 'leave', 'behavior', 'training', 'other'
    content: str  # Contenu HTML/Texte avec placeholders
    fields: List[str] = []  # Liste des champs dynamiques: ['employee_name', 'start_date', etc.]
    source_module: Optional[str] = None  # Module lié: 'leaves', 'behaviors', 'payroll', 'employees', 'discipline', 'other'
    file_url: Optional[str] = None  # URL du fichier template uploadé (.docx, .pdf)
    manual_data_source: Optional[str] = None  # Description manuelle de la provenance des données

class DocumentCreate(BaseModel):
    template_id: str
    employee_id: str
    beneficiary_name: str
    beneficiary_matricule: str
    document_type: str  # Type de document
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    reason: str
    source_module: Optional[str] = None  # 'leaves', 'behaviors', etc.
    source_id: Optional[str] = None  # ID du congé, comportement, etc.
    custom_data: Optional[dict] = {}  # Données personnalisées supplémentaires

class DocumentUpdate(BaseModel):
    content: Optional[str] = None
    status: Optional[str] = None  # 'draft', 'pending_approval', 'approved', 'rejected'

class DocumentApproval(BaseModel):
    document_id: str
    action: str  # 'approve' or 'reject'
    signature_password: str
    comment: Optional[str] = None

class SignaturePasswordCreate(BaseModel):
    password: str
    confirm_password: str

class SignaturePasswordVerify(BaseModel):
    password: str

class SignaturePasswordUpdate(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class SignaturePasswordReset(BaseModel):
    user_id: str
    new_password: str
    confirm_password: str

class SignatureSettings(BaseModel):
    signature_image_url: Optional[str] = None
    stamp_image_url: Optional[str] = None

class DocumentUpload(BaseModel):
    name: str
    type: str  # 'certificate', 'pdf', 'image'
    url: str

# ==================== DOCUMENTS MODULE (WORD-LIKE) MODELS ====================
class DocumentForm(BaseModel):
    name: str
    description: Optional[str] = None
    category: str  # 'blank', 'leave', 'letter', 'report', 'invoice', 'contract', 'other'
    thumbnail_url: Optional[str] = None
    content: str  # HTML content
    is_system: bool = False  # System form or user-uploaded

class DocumentCreate(BaseModel):
    form_id: Optional[str] = None  # Reference to form template
    title: str
    content: str  # HTML content from editor

class DocumentUpdateContent(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

# ==================== PERMISSIONS MODELS (NEW SYSTEM) ====================
class PermissionItem(BaseModel):
    key: str  # e.g., "view_employees"
    label: str  # e.g., "Voir la liste des employés"
    action: str  # e.g., "view", "create", "edit", "delete"
    full_path: str  # e.g., "gestion_personnel.view_employees"

class PermissionModule(BaseModel):
    module: str  # e.g., "gestion_personnel"
    label: str  # e.g., "Gestion du Personnel"
    icon: str  # e.g., "Users"
    permissions: List[PermissionItem]

class RolePermissionsUpdate(BaseModel):
    permissions: List[str]  # Liste des permissions au format "module.permission"

class RoleInfo(BaseModel):
    role: str  # e.g., "admin", "secretary", "employee"
    label: str
    description: str
    permissions: List[str]

# ==================== AUTH HELPERS ====================
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
    return user

def require_roles(allowed_roles: List[str]):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        return current_user
    return role_checker

def calculate_working_days(start_date: str, end_date: str) -> int:
    """Calculate working days between two dates (excluding weekends)"""
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    
    working_days = 0
    current = start
    while current <= end:
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            working_days += 1
        current += timedelta(days=1)
    
    return working_days

def calculate_age(birth_date: str) -> int:
    """Calculate age from birth date"""
    if not birth_date:
        return 0
    birth = datetime.strptime(birth_date, "%Y-%m-%d").date()
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))

# ==================== ROUTERS ====================
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
employees_router = APIRouter(prefix="/employees", tags=["Personnel"])
leaves_router = APIRouter(prefix="/leaves", tags=["Congés"])
calendar_router = APIRouter(prefix="/calendar", tags=["Calendrier"])
hr_router = APIRouter(prefix="/hr", tags=["RH Actions"])
config_router = APIRouter(prefix="/config", tags=["Configuration"])
behavior_router = APIRouter(prefix="/behavior", tags=["Comportement"])
communication_router = APIRouter(prefix="/communication", tags=["Communication"])
upload_router = APIRouter(prefix="/upload", tags=["Upload"])
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])
sites_router = APIRouter(prefix="/sites", tags=["Sites de travail"])
permissions_router = APIRouter(prefix="/permissions", tags=["Permissions Dynamiques"])

# ==================== AUTH ROUTES ====================

@auth_router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user - ALL ROLES ARE ACTIVATED IMMEDIATELY"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà enregistré")
    
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)
    
    # Get default leave rules
    leave_rules = await db.leave_rules.find_one({"type": "default"}, {"_id": 0})
    if not leave_rules:
        leave_rules = LeaveRuleConfig().model_dump()
    
    # ALL ACCOUNTS ARE ACTIVE IMMEDIATELY - NO APPROVAL REQUIRED
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hashed_password,
        "first_name": user_data.first_name,
        "last_name": user_data.last_name,
        "role": user_data.role,
        "department": user_data.department,
        "category": user_data.category,
        "position": user_data.position,
        "phone": user_data.phone,
        "hire_date": user_data.hire_date,
        "salary": user_data.salary,
        "salary_currency": user_data.salary_currency,
        "birth_date": None,
        "is_active": True,  # ALWAYS ACTIVE
        "created_at": datetime.now(timezone.utc).isoformat(),
        "avatar_url": None,
        "leave_balance": {
            "annual": leave_rules.get("annual_days", 26),
            "sick": leave_rules.get("sick_days", 2),
            "exceptional": leave_rules.get("exceptional_days", 15),
            "maternity": leave_rules.get("maternity_days", 90),
            "paternity": leave_rules.get("paternity_days", 10)
        },
        "leave_taken": {
            "annual": 0,
            "sick": 0,
            "exceptional": 0,
            "maternity": 0,
            "paternity": 0
        }
    }
    
    await db.users.insert_one(user_doc)
    
    # Return token immediately for ALL roles
    access_token = create_access_token(data={"sub": user_id, "role": user_data.role})
    
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        department=user_data.department,
        category=user_data.category,
        position=user_data.position,
        is_active=True,
        created_at=user_doc["created_at"]
    )
    
    return TokenResponse(access_token=access_token, user=user_response)

@auth_router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login - simple check for active account"""
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Compte désactivé")
    
    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})
    
    user_response = UserResponse(**{k: v for k, v in user.items() if k != "password"})
    
    # Créer une notification de connexion pour les admins
    login_time = datetime.now(timezone.utc)
    login_time_formatted = login_time.strftime("%d/%m/%Y à %H:%M")
    user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get('email', 'Utilisateur')
    
    asyncio.create_task(create_admin_notification(
        title=f"🔐 Nouvelle connexion: {user_name}",
        message=f"{user_name} ({user.get('role', 'utilisateur')}) s'est connecté le {login_time_formatted}",
        notification_type="info",
        link=None
    ))
    
    # Si c'est un admin qui se connecte, envoyer les notifications de congés à venir
    if user.get("role") in ["admin", "super_admin"]:
        asyncio.create_task(send_upcoming_leaves_notification(user["id"]))
    
    return TokenResponse(access_token=access_token, user=user_response)

@auth_router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    return user

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@auth_router.put("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    """Change user password"""
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Verify current password
    if not verify_password(password_data.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    
    # Hash and update new password
    hashed_password = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password": hashed_password}}
    )
    
    return {"message": "Mot de passe modifié avec succès"}

# ==================== FORGOT PASSWORD ====================
import secrets
import asyncio

# Try to import resend, but don't fail if not available
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@auth_router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send password reset email"""
    # Re-read env vars to ensure they're loaded after restart
    resend_api_key = os.environ.get('RESEND_API_KEY', '')
    sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    frontend_url = os.environ.get('FRONTEND_URL', 'https://doc-automate-2.preview.emergentagent.com')
    
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "Si cette adresse email existe, un lien de réinitialisation a été envoyé."}
    
    # Generate reset token
    reset_token = secrets.token_urlsafe(32)
    token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Store reset token
    await db.password_resets.delete_many({"email": request.email})  # Remove old tokens
    await db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "email": request.email,
        "token": reset_token,
        "expires_at": token_expiry.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Send email if Resend is configured
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    if RESEND_AVAILABLE and resend_api_key:
        resend.api_key = resend_api_key
        try:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">Réinitialisation de mot de passe</h2>
                <p>Bonjour {user['first_name']},</p>
                <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte PREMIDIS.</p>
                <p style="margin: 30px 0;">
                    <a href="{reset_link}" 
                       style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                        Réinitialiser mon mot de passe
                    </a>
                </p>
                <p>Ce lien expire dans 1 heure.</p>
                <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
                <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 12px;">PREMIDIS SARL - Plateforme RH</p>
            </div>
            """
            
            params = {
                "from": sender_email,
                "to": [request.email],
                "subject": "Réinitialisation de votre mot de passe - PREMIDIS",
                "html": html_content
            }
            
            await asyncio.to_thread(resend.Emails.send, params)
            logging.info(f"Password reset email sent to {request.email}")
        except Exception as e:
            logging.error(f"Failed to send password reset email: {str(e)}")
            # Don't fail the request, just log the error
    else:
        logging.warning(f"Email not sent - Resend not configured. Reset link: {reset_link}")
    
    return {"message": "Si cette adresse email existe, un lien de réinitialisation a été envoyé."}

@auth_router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password using token"""
    # Find valid token
    reset_record = await db.password_resets.find_one({"token": request.token}, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Lien de réinitialisation invalide ou expiré")
    
    # Check expiry
    expiry = datetime.fromisoformat(reset_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expiry:
        await db.password_resets.delete_one({"token": request.token})
        raise HTTPException(status_code=400, detail="Lien de réinitialisation expiré")
    
    # Update password
    hashed_password = get_password_hash(request.new_password)
    result = await db.users.update_one(
        {"email": reset_record["email"]},
        {"$set": {"password": hashed_password}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Delete used token
    await db.password_resets.delete_one({"token": request.token})
    
    return {"message": "Mot de passe réinitialisé avec succès"}

@auth_router.get("/verify-reset-token")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    reset_record = await db.password_resets.find_one({"token": token}, {"_id": 0})
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Token invalide")
    
    expiry = datetime.fromisoformat(reset_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Token expiré")
    
    return {"valid": True, "email": reset_record["email"]}

# ==================== EMPLOYEES ROUTES ====================
@employees_router.get("")
async def list_employees(
    department: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Employees can only see themselves
    if current_user["role"] == "employee":
        user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
        return {"employees": [user], "total": 1}
    
    # Secretary can see employees in their department only
    query = {}
    if current_user["role"] == "secretary":
        query["department"] = current_user.get("department")
    
    if department:
        query["department"] = department
    if category:
        query["category"] = category
    
    employees = await db.users.find(query, {"_id": 0, "password": 0}).to_list(500)
    return {"employees": employees, "total": len(employees)}

@employees_router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(
    employee: UserCreate,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Create a new employee (admin and secretary)"""
    existing = await db.users.find_one({"email": employee.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà enregistré")
    
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(employee.password)
    
    # Get default leave rules
    leave_rules = await db.leave_rules.find_one({"type": "default"}, {"_id": 0})
    if not leave_rules:
        leave_rules = LeaveRuleConfig().model_dump()
    
    user_doc = {
        "id": user_id,
        "email": employee.email,
        "password": hashed_password,
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "role": employee.role,
        "department": employee.department,
        "category": employee.category,
        "position": employee.position,
        "phone": employee.phone,
        "hire_date": employee.hire_date,
        "salary": employee.salary,
        "salary_currency": employee.salary_currency or "USD",
        "birth_date": None,
        "site_id": employee.site_id,
        "hierarchy_level": employee.hierarchy_level,
        "is_active": True,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "avatar_url": None,
        "leave_balance": {
            "annual": leave_rules.get("annual_days", 26),
            "sick": leave_rules.get("sick_days", 2),
            "exceptional": leave_rules.get("exceptional_days", 15),
            "maternity": leave_rules.get("maternity_days", 90)
        },
        "leave_taken": {
            "annual": 0,
            "sick": 0,
            "exceptional": 0,
            "maternity": 0
        }
    }
    
    await db.users.insert_one(user_doc)
    user_doc.pop("_id", None)
    user_doc.pop("password", None)
    return user_doc

@employees_router.get("/{employee_id}")
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    # Employees can only view themselves
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    employee = await db.users.find_one({"id": employee_id}, {"_id": 0, "password": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    # Enrich with site info
    if employee.get("site_id"):
        site = await db.sites.find_one({"id": employee["site_id"]}, {"_id": 0})
        if site:
            employee["site_name"] = site.get("name")
    
    # Enrich with hierarchical group info
    if employee.get("hierarchical_group_id"):
        group = await db.hierarchical_groups.find_one({"id": employee["hierarchical_group_id"]}, {"_id": 0})
        if group:
            employee["hierarchical_group_name"] = group.get("name")
    
    return employee

@employees_router.put("/{employee_id}")
async def update_employee(
    employee_id: str,
    updates: EmployeeUpdate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    if update_data:
        await db.users.update_one({"id": employee_id}, {"$set": update_data})
    
    employee = await db.users.find_one({"id": employee_id}, {"_id": 0, "password": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    return employee

@employees_router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    permanent: bool = False,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete or deactivate an employee"""
    employee = await db.users.find_one({"id": employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    if permanent:
        # Permanent deletion - also delete related data
        await db.users.delete_one({"id": employee_id})
        await db.leaves.delete_many({"employee_id": employee_id})
        await db.behaviors.delete_many({"employee_id": employee_id})
        await db.documents.delete_many({"employee_id": employee_id})
        await db.attendance.delete_many({"employee_id": employee_id})
        return {"message": "Employé supprimé définitivement"}
    else:
        # Soft delete - just deactivate
        await db.users.update_one({"id": employee_id}, {"$set": {"is_active": False, "status": "inactive"}})
        return {"message": "Employé désactivé"}

# ==================== LEAVE MANAGEMENT ROUTES ====================
@leaves_router.get("")
async def list_leaves(
    status: Optional[str] = None,
    leave_type: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Employees see only their own leaves
    if current_user["role"] == "employee":
        query["employee_id"] = current_user["id"]
    elif employee_id:
        # Admin/Secretary can filter by employee_id
        query["employee_id"] = employee_id
    
    if status:
        query["status"] = status
    if leave_type:
        query["leave_type"] = leave_type
    
    leaves = await db.leaves.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"leaves": leaves}

@leaves_router.get("/stats")
async def get_leave_stats(current_user: dict = Depends(get_current_user)):
    """Get leave statistics"""
    query = {}
    if current_user["role"] == "employee":
        query["employee_id"] = current_user["id"]
    
    pending = await db.leaves.count_documents({**query, "status": "pending"})
    approved = await db.leaves.count_documents({**query, "status": "approved"})
    rejected = await db.leaves.count_documents({**query, "status": "rejected"})
    
    return {"pending": pending, "approved": approved, "rejected": rejected}

@leaves_router.get("/calendar")
async def get_leaves_for_calendar(
    month: int = None,
    year: int = None,
    current_user: dict = Depends(get_current_user)
):
    """Get approved leaves for calendar display - ALL approved leaves visible to everyone"""
    now = datetime.now()
    target_month = month or now.month
    target_year = year or now.year
    
    # ALL users see ALL approved leaves (for global calendar visibility)
    # This allows employees and admins to see when colleagues are on leave
    query = {"status": "approved"}
    
    leaves = await db.leaves.find(query, {"_id": 0}).to_list(500)
    
    # Filter by month
    filtered = []
    for leave in leaves:
        try:
            start = datetime.strptime(leave["start_date"], "%Y-%m-%d")
            end = datetime.strptime(leave["end_date"], "%Y-%m-%d")
            # Check if leave overlaps with target month
            month_start = datetime(target_year, target_month, 1)
            if target_month == 12:
                month_end = datetime(target_year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = datetime(target_year, target_month + 1, 1) - timedelta(days=1)
            
            if start <= month_end and end >= month_start:
                filtered.append(leave)
        except:
            pass
    
    return {"leaves": filtered, "month": target_month, "year": target_year}

@leaves_router.post("", status_code=status.HTTP_201_CREATED)
async def create_leave_request(
    leave: LeaveRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create leave request - NO VALIDATION, pure registration system"""
    # Validate dates format only
    try:
        start = datetime.strptime(leave.start_date, "%Y-%m-%d")
        end = datetime.strptime(leave.end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide (YYYY-MM-DD)")
    
    # Calculate working days (no validation on duration)
    working_days = calculate_working_days(leave.start_date, leave.end_date)
    
    # Admin/Secretary can create for others or for all employees
    can_create_for_others = current_user["role"] in ["admin", "secretary"]
    
    # For collective leaves - create for all employees
    if leave.for_all_employees and can_create_for_others:
        all_employees = await db.users.find({"is_active": True}, {"_id": 0}).to_list(500)
        created_leaves = []
        
        for emp in all_employees:
            leave_id = str(uuid.uuid4())
            leave_doc = {
                "id": leave_id,
                "employee_id": emp["id"],
                "employee_name": f"{emp['first_name']} {emp['last_name']}",
                "department": emp.get("department", ""),
                "position": emp.get("position", ""),
                "leave_type": leave.leave_type or "collective",
                "start_date": leave.start_date,
                "end_date": leave.end_date,
                "working_days": working_days,
                "reason": leave.reason,
                "status": "approved",  # Auto-approved for collective
                "is_collective": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["id"],
                "admin_comment": "Congé collectif - appliqué à tous les employés",
                "approved_by": current_user["id"],
                "approved_at": datetime.now(timezone.utc).isoformat()
            }
            await db.leaves.insert_one(leave_doc)
            leave_doc.pop("_id", None)
            created_leaves.append(leave_doc)
        
        return {"message": f"Congé collectif créé pour {len(created_leaves)} employés", "count": len(created_leaves)}
    
    # Determine target employee
    if leave.employee_id and can_create_for_others:
        target_employee = await db.users.find_one({"id": leave.employee_id}, {"_id": 0})
        if not target_employee:
            raise HTTPException(status_code=404, detail="Employé non trouvé")
        target_id = leave.employee_id
        target_name = f"{target_employee['first_name']} {target_employee['last_name']}"
        target_dept = target_employee.get("department", "")
        target_position = target_employee.get("position", "")
    else:
        target_id = current_user["id"]
        target_name = f"{current_user['first_name']} {current_user['last_name']}"
        target_dept = current_user.get("department", "")
        target_position = current_user.get("position", "")
    
    # Create leave request - NO VALIDATIONS, pure data registration
    leave_id = str(uuid.uuid4())
    leave_doc = {
        "id": leave_id,
        "employee_id": target_id,
        "employee_name": target_name,
        "department": target_dept,
        "position": target_position,
        "leave_type": leave.leave_type,
        "start_date": leave.start_date,
        "end_date": leave.end_date,
        "working_days": working_days,
        "reason": leave.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"] if leave.employee_id else None,
        "admin_comment": None,
        "approved_by": None,
        "approved_at": None
    }
    
    await db.leaves.insert_one(leave_doc)
    leave_doc.pop("_id", None)
    return leave_doc

async def create_overlap_notification(employee_name: str, department: str, start_date: str, end_date: str, overlaps: list):
    """Create notification and send email for leave overlaps"""
    # Create in-app notification for all admins
    admins = await db.users.find({"role": {"$in": ["admin", "super_admin"]}, "is_active": True}, {"_id": 0}).to_list(50)
    
    overlap_details = "\n".join([f"- {o['employee_name']} ({o.get('department', o.get('role', ''))}): {o['dates']}" for o in overlaps])
    
    for admin in admins:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": admin["id"],
            "type": "leave_overlap",
            "title": "⚠️ Chevauchement de congés détecté",
            "message": f"{employee_name} ({department}) demande un congé du {start_date} au {end_date}.\n\nChevauchements:\n{overlap_details}",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    # Send email notification
    settings = await db.system_settings.find_one({"type": "notifications"}, {"_id": 0})
    admin_email = settings.get("admin_notification_email", "bahizifranck0@gmail.com") if settings else "bahizifranck0@gmail.com"
    
    resend_api_key = os.environ.get('RESEND_API_KEY', '')
    sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    
    if resend_api_key:
        try:
            import resend
            resend.api_key = resend_api_key
            
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #F59E0B;">⚠️ Chevauchement de congés détecté</h2>
                <p><strong>{employee_name}</strong> du département <strong>{department}</strong> a demandé un congé:</p>
                <p><strong>Période:</strong> {start_date} au {end_date}</p>
                <h3 style="color: #EF4444;">Chevauchements détectés:</h3>
                <ul>
                    {''.join([f'<li><strong>{o["employee_name"]}</strong> - {o.get("department", o.get("role", ""))}: {o["dates"]}</li>' for o in overlaps])}
                </ul>
                <p>Veuillez vérifier et gérer cette demande dans la plateforme.</p>
                <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 12px;">PREMIDIS SARL - Plateforme RH</p>
            </div>
            """
            
            params = {
                "from": sender_email,
                "to": [admin_email],
                "subject": f"⚠️ Chevauchement de congés: {employee_name}",
                "html": html_content
            }
            
            await asyncio.to_thread(resend.Emails.send, params)
            logging.info(f"Leave overlap notification sent to {admin_email}")
        except Exception as e:
            logging.error(f"Failed to send overlap notification: {str(e)}")

# ==================== NOTIFICATION HELPER FUNCTIONS ====================
async def create_notification(user_ids: List[str], title: str, message: str, notification_type: str = "info", link: Optional[str] = None):
    """Helper function to create notifications for multiple users"""
    notifications = []
    for user_id in user_ids:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": notification_type,
            "title": title,
            "message": message,
            "link": link,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        notifications.append(notification)
    
    if notifications:
        await db.notifications.insert_many(notifications)
    return len(notifications)

async def create_admin_notification(title: str, message: str, notification_type: str = "info", link: Optional[str] = None):
    """Create notification for all admins"""
    admins = await db.users.find(
        {"role": {"$in": ["admin", "super_admin"]}, "is_active": True}, 
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    admin_ids = [admin["id"] for admin in admins]
    if admin_ids:
        return await create_notification(admin_ids, title, message, notification_type, link)
    return 0

async def send_upcoming_leaves_notification(admin_user_id: str):
    """Send notification about upcoming leaves when admin logs in"""
    today = datetime.now(timezone.utc).date()
    next_7_days = today + timedelta(days=7)
    
    # Find approved leaves starting in the next 7 days
    upcoming_leaves = await db.leaves.find(
        {
            "status": "approved",
            "start_date": {
                "$gte": today.isoformat(),
                "$lte": next_7_days.isoformat()
            }
        },
        {"_id": 0}
    ).to_list(50)
    
    if not upcoming_leaves:
        return
    
    # Group by date
    leaves_by_date = {}
    for leave in upcoming_leaves:
        start_date = leave.get("start_date", "")
        if start_date not in leaves_by_date:
            leaves_by_date[start_date] = []
        
        # Get employee info
        employee = await db.users.find_one({"id": leave["employee_id"]}, {"_id": 0, "first_name": 1, "last_name": 1})
        if employee:
            employee_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
            leaves_by_date[start_date].append({
                "name": employee_name,
                "type": leave.get("type", "Congé"),
                "end_date": leave.get("end_date", "")
            })
    
    # Create notification message
    message_parts = []
    for date_str in sorted(leaves_by_date.keys()):
        leaves_on_date = leaves_by_date[date_str]
        date_obj = datetime.fromisoformat(date_str).date()
        days_until = (date_obj - today).days
        
        if days_until == 0:
            date_label = "Aujourd'hui"
        elif days_until == 1:
            date_label = "Demain"
        else:
            date_label = f"Dans {days_until} jours ({date_str})"
        
        names = ", ".join([f"{l['name']} ({l['type']})" for l in leaves_on_date])
        message_parts.append(f"📅 {date_label}: {names}")
    
    full_message = "\n".join(message_parts)
    
    # Send notification to this admin only
    await create_notification(
        user_ids=[admin_user_id],
        title=f"📋 {len(upcoming_leaves)} congé(s) à venir dans les 7 prochains jours",
        message=full_message,
        notification_type="info",
        link="/time-management"
    )

@leaves_router.get("/balance")
async def get_leave_balance(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    leave_balance = user.get("leave_balance", {})
    leave_taken = user.get("leave_taken", {})
    
    balance = {}
    for leave_type in ["annual", "sick", "exceptional", "maternity"]:
        total = leave_balance.get(leave_type, 0)
        taken = leave_taken.get(leave_type, 0)
        balance[leave_type] = {
            "total": total,
            "taken": taken,
            "remaining": total - taken
        }
    
    return balance

@leaves_router.get("/rules")
async def get_leave_rules(current_user: dict = Depends(get_current_user)):
    """Get leave rules - visible to all employees"""
    rules = await db.leave_rules.find_one({"type": "default"}, {"_id": 0})
    if not rules:
        rules = {
            "annual_days": 26,
            "sick_days": 2,
            "exceptional_days": 15,
            "maternity_days": 90
        }
    
    leave_types = [
        {
            "type": "annual",
            "name": "Congé annuel",
            "max_days": rules.get("annual_days", 26),
            "description": "Congé annuel de repos",
            "can_request": True
        },
        {
            "type": "sick",
            "name": "Congé maladie",
            "max_days": rules.get("sick_days", 2),
            "description": "Congé pour raison médicale",
            "can_request": True
        },
        {
            "type": "exceptional",
            "name": "Autorisation exceptionnelle",
            "max_days": rules.get("exceptional_days", 15),
            "description": "Congé pour circonstances exceptionnelles (mariage, décès, etc.)",
            "can_request": True
        },
        {
            "type": "maternity",
            "name": "Congé maternité",
            "max_days": rules.get("maternity_days", 90),
            "description": "Congé maternité (3 mois)",
            "can_request": True
        },
        {
            "type": "public",
            "name": "Jour férié",
            "max_days": 0,
            "description": "Jours fériés officiels (configurés par l'administration)",
            "can_request": False
        }
    ]
    
    return {"rules": rules, "leave_types": leave_types}

@leaves_router.put("/{leave_id}")
async def update_leave_status(
    leave_id: str,
    update: LeaveUpdate,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Update leave status - NO VALIDATION, pure status update"""
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Prepare update data
    update_data = {}
    if update.status:
        update_data["status"] = update.status
        update_data["approved_by"] = current_user["id"]
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    
    if update.admin_comment is not None:
        update_data["admin_comment"] = update.admin_comment
    
    # Update leave - NO BALANCE CHECKS, NO VALIDATIONS
    await db.leaves.update_one({"id": leave_id}, {"$set": update_data})
    
    # Update leave balance if approved (optional tracking, not blocking)
    if update.status == "approved" and leave["status"] != "approved":
        await db.users.update_one(
            {"id": leave["employee_id"]},
            {"$inc": {f"leave_taken.{leave['leave_type']}": leave["working_days"]}}
        )
    # Restore balance if rejected after approval (optional tracking)
    elif update.status == "rejected" and leave["status"] == "approved":
        await db.users.update_one(
            {"id": leave["employee_id"]},
            {"$inc": {f"leave_taken.{leave['leave_type']}": -leave["working_days"]}}
        )
    
    # Add to calendar if approved (for visualization only)
    if update.status == "approved":
        calendar_entry = {
            "id": str(uuid.uuid4()),
            "employee_id": leave["employee_id"],
            "employee_name": leave["employee_name"],
            "type": "leave",
            "leave_type": leave["leave_type"],
            "leave_id": leave_id,
            "start_date": leave["start_date"],
            "end_date": leave["end_date"],
            "title": f"Congé {leave['leave_type']} - {leave['employee_name']}",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.calendar.insert_one(calendar_entry)
    
    updated = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    return updated

@leaves_router.get("/{leave_id}")
async def get_leave_details(leave_id: str, current_user: dict = Depends(get_current_user)):
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Employees can only see their own
    if current_user["role"] == "employee" and leave["employee_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    return leave

@leaves_router.post("/{leave_id}/generate-document", status_code=status.HTTP_201_CREATED)
async def generate_leave_document(
    leave_id: str,
    template_id: str,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """
    Générer automatiquement un document à partir d'un congé approuvé
    Remplace les balises et coche automatiquement les cases (site, type de congé)
    """
    # Récupérer le congé
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Congé non trouvé")
    
    # Vérifier que le congé est approuvé
    if leave.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Le congé doit être approuvé pour générer un document")
    
    # Récupérer l'employé
    employee = await db.users.find_one({"id": leave["employee_id"]}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    # Récupérer le site de l'employé
    employee_site = None
    if employee.get("site_id"):
        employee_site = await db.sites.find_one({"id": employee["site_id"]}, {"_id": 0})
    
    # Récupérer le modèle de document (depuis document_forms, pas document_templates)
    template = await db.document_forms.find_one({"id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    # Calculer la date de retour (date_fin + 1, si dimanche → +2)
    from datetime import datetime, timedelta
    date_fin = datetime.strptime(leave["end_date"], "%Y-%m-%d")
    date_retour = date_fin + timedelta(days=1)
    # Si c'est un dimanche (weekday() == 6), ajouter 1 jour de plus
    if date_retour.weekday() == 6:
        date_retour = date_retour + timedelta(days=1)
    
    # Préparer les données pour le remplacement des balises
    replacements = {
        "{{employe.nom}}": f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip(),
        "{{employe.departement}}": employee.get('department', 'N/A'),
        "{{employe.fonction}}": employee.get('position', 'N/A'),
        "{{employe.site}}": employee_site.get('name', 'N/A') if employee_site else 'N/A',
        "{{conge.date_debut}}": datetime.strptime(leave["start_date"], "%Y-%m-%d").strftime("%d/%m/%Y"),
        "{{conge.date_fin}}": datetime.strptime(leave["end_date"], "%Y-%m-%d").strftime("%d/%m/%Y"),
        "{{conge.nb_jours}}": str(leave.get("working_days", leave.get("days_requested", 0))),
        "{{conge.date_retour}}": date_retour.strftime("%d/%m/%Y"),
        "{{conge.type}}": leave.get("leave_type_label", leave.get("leave_type", "N/A")),
        "{{date.document}}": datetime.now(timezone.utc).strftime("%d/%m/%Y")
    }
    
    # Remplacer les balises dans le contenu du modèle
    content = template.get("content", "")
    for placeholder, value in replacements.items():
        content = content.replace(placeholder, value)
    
    # Cocher automatiquement la case correspondant au type de congé
    leave_type = leave.get("leave_type")
    if leave_type:
        # Chercher et cocher la checkbox correspondante
        content = content.replace(
            f'data-auto-check="{leave_type}"',
            f'data-auto-check="{leave_type}" checked'
        )
    
    # Créer le document dans la base de données
    document_doc = {
        "id": str(uuid.uuid4()),
        "template_id": template_id,
        "template_name": template.get("name", "Document"),
        "employee_id": leave["employee_id"],
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "beneficiary_name": f"{employee['first_name']} {employee['last_name']}",
        "beneficiary_matricule": employee.get("id", "N/A"),
        "document_type": "Congé",
        "period_start": leave["start_date"],
        "period_end": leave["end_date"],
        "reason": leave.get("reason", ""),
        "source_module": "leaves",
        "source_id": leave_id,
        "content": content,
        "original_template": template.get("content", ""),
        "status": "draft",  # Draft pour permettre l'édition manuelle
        "metadata": {
            "employee_site": employee_site.get('name') if employee_site else None,
            "leave_type": leave.get("leave_type"),
            "leave_type_label": leave.get("leave_type_label", leave.get("leave_type")),
            "auto_check_site": employee_site.get('name') if employee_site else None,
            "auto_check_leave_type": leave.get("leave_type_label", leave.get("leave_type"))
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "created_by_name": f"{current_user['first_name']} {current_user['last_name']}"
    }
    
    await db.hr_documents.insert_one(document_doc)
    document_doc.pop("_id", None)
    
    return {
        "message": "Document généré avec succès",
        "document": document_doc
    }

@leaves_router.delete("/{leave_id}")
async def delete_leave(
    leave_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a leave request - Admin can delete any, employees can delete their own pending"""
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Congé non trouvé")
    
    # Check permissions
    is_admin = current_user["role"] in ["admin", "secretary"]
    is_own = leave["employee_id"] == current_user["id"]
    
    if not is_admin and not is_own:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Employees can only delete pending leaves
    if not is_admin and leave["status"] != "pending":
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que les demandes en attente")
    
    # If was approved, restore the leave balance
    if leave["status"] == "approved":
        await db.users.update_one(
            {"id": leave["employee_id"]},
            {"$inc": {f"leave_taken.{leave['leave_type']}": -leave.get("working_days", 0)}}
        )
    
    # Delete from leaves collection
    await db.leaves.delete_one({"id": leave_id})
    
    # Also delete from calendar if exists
    await db.calendar.delete_many({"leave_id": leave_id})
    
    return {"message": "Congé supprimé", "id": leave_id}

# ==================== CALENDAR ROUTES ====================
@calendar_router.get("")
async def get_calendar(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now()
    target_month = month or now.month
    target_year = year or now.year
    
    query = {}
    
    # Employees see only their calendar
    if current_user["role"] == "employee":
        query["$or"] = [
            {"employee_id": current_user["id"]},
            {"type": "public_holiday"}
        ]
    
    entries = await db.calendar.find(query, {"_id": 0}).to_list(500)
    
    # Filter by month
    filtered = []
    for entry in entries:
        try:
            start = datetime.strptime(entry["start_date"], "%Y-%m-%d")
            if start.month == target_month and start.year == target_year:
                filtered.append(entry)
        except:
            pass
    
    return {"entries": filtered, "month": target_month, "year": target_year}

@calendar_router.post("/holiday")
async def add_public_holiday(
    date: str,
    name: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    holiday = {
        "id": str(uuid.uuid4()),
        "type": "public_holiday",
        "start_date": date,
        "end_date": date,
        "title": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.calendar.insert_one(holiday)
    holiday.pop("_id", None)
    return holiday

# ==================== HR ACTIONS ROUTES ====================
@hr_router.post("/salary-advance")
async def create_salary_advance(
    advance: SalaryAdvance,
    current_user: dict = Depends(require_roles(["admin"]))
):
    advance_id = str(uuid.uuid4())
    advance_doc = {
        "id": advance_id,
        "type": "salary_advance",
        **advance.model_dump(),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.hr_actions.insert_one(advance_doc)
    advance_doc.pop("_id", None)
    return advance_doc

@hr_router.post("/bonus")
async def create_bonus(
    bonus: Bonus,
    current_user: dict = Depends(require_roles(["admin"]))
):
    bonus_id = str(uuid.uuid4())
    bonus_doc = {
        "id": bonus_id,
        "type": "bonus",
        **bonus.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.hr_actions.insert_one(bonus_doc)
    bonus_doc.pop("_id", None)
    return bonus_doc

@hr_router.post("/exit-authorization")
async def create_exit_authorization(
    auth: ExitAuthorization,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    auth_id = str(uuid.uuid4())
    auth_doc = {
        "id": auth_id,
        "type": "exit_authorization",
        **auth.model_dump(),
        "status": "approved",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.hr_actions.insert_one(auth_doc)
    auth_doc.pop("_id", None)
    return auth_doc

@hr_router.get("/actions/{employee_id}")
async def get_employee_hr_actions(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    # Employees can only see their own
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    actions = await db.hr_actions.find({"employee_id": employee_id}, {"_id": 0}).to_list(100)
    return {"actions": actions}

# ==================== ATTENDANCE ROUTES ====================
attendance_router = APIRouter(prefix="/attendance", tags=["Pointage"])

@attendance_router.get("")
async def list_attendance(current_user: dict = Depends(get_current_user)):
    """List attendance records"""
    query = {}
    if current_user["role"] == "employee":
        query["employee_id"] = current_user["id"]
    
    attendance = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return {"attendance": attendance}

@attendance_router.get("/today")
async def get_today_attendance(current_user: dict = Depends(get_current_user)):
    """Get today's attendance for current user"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    attendance = await db.attendance.find_one(
        {"employee_id": current_user["id"], "date": today},
        {"_id": 0}
    )
    return {"attendance": attendance}

@attendance_router.post("/check-in")
async def check_in(current_user: dict = Depends(get_current_user)):
    """Record check-in time"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    
    existing = await db.attendance.find_one({"employee_id": current_user["id"], "date": today})
    if existing and existing.get("check_in"):
        raise HTTPException(status_code=400, detail="Pointage d'entrée déjà enregistré")
    
    attendance_doc = {
        "id": str(uuid.uuid4()),
        "employee_id": current_user["id"],
        "employee_name": f"{current_user['first_name']} {current_user['last_name']}",
        "date": today,
        "check_in": now_time,
        "check_out": None,
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.attendance.insert_one(attendance_doc)
    attendance_doc.pop("_id", None)
    return attendance_doc

@attendance_router.post("/check-out")
async def check_out(current_user: dict = Depends(get_current_user)):
    """Record check-out time"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    
    existing = await db.attendance.find_one({"employee_id": current_user["id"], "date": today})
    if not existing:
        raise HTTPException(status_code=400, detail="Aucun pointage d'entrée trouvé")
    if existing.get("check_out"):
        raise HTTPException(status_code=400, detail="Pointage de sortie déjà enregistré")
    
    await db.attendance.update_one(
        {"employee_id": current_user["id"], "date": today},
        {"$set": {"check_out": now_time}}
    )
    
    updated = await db.attendance.find_one({"employee_id": current_user["id"], "date": today}, {"_id": 0})
    return updated

@attendance_router.post("")
async def create_attendance_manual(
    attendance: AttendanceCreate,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Manually create attendance record (admin/secretary only)"""
    employee = await db.users.find_one({"id": attendance.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    attendance_doc = {
        "id": str(uuid.uuid4()),
        "employee_id": attendance.employee_id,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "date": attendance.date,
        "check_in": attendance.check_in,
        "check_out": attendance.check_out,
        "notes": attendance.notes or "",
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.attendance.insert_one(attendance_doc)
    attendance_doc.pop("_id", None)
    return attendance_doc

# ==================== CONFIG ROUTES (Admin Only) ====================

# System settings endpoints
class SystemSettings(BaseModel):
    admin_notification_email: str = "bahizifranck0@gmail.com"

@config_router.get("/system-settings")
async def get_system_settings(current_user: dict = Depends(require_roles(["admin", "super_admin"]))):
    """Get system settings"""
    settings = await db.system_settings.find_one({"type": "notifications"}, {"_id": 0})
    if not settings:
        settings = {
            "type": "notifications",
            "admin_notification_email": "bahizifranck0@gmail.com"
        }
        await db.system_settings.insert_one(settings)
    return settings

@config_router.put("/system-settings")
async def update_system_settings(
    settings: SystemSettings,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Update system settings"""
    settings_doc = {
        "type": "notifications",
        "admin_notification_email": settings.admin_notification_email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.system_settings.update_one(
        {"type": "notifications"},
        {"$set": settings_doc},
        upsert=True
    )
    return settings_doc

# Leave types configuration
class LeaveTypeConfig(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    duration_value: int = 1  # Durée officielle
    duration_unit: str = "days"  # days, weeks, months
    min_days: int = 1
    max_days: int = 365
    default_balance: int = 365
    requires_approval: bool = True
    is_active: bool = True
    color: str = "#4F46E5"

@config_router.get("/leave-types")
async def get_leave_types(current_user: dict = Depends(get_current_user)):
    """Get all configured leave types"""
    leave_types = await db.leave_types.find({"is_active": True}, {"_id": 0}).to_list(50)
    
    # If no custom types exist, return defaults with duration configuration
    if not leave_types:
        default_types = [
            {"id": "annual", "name": "Congé annuel", "code": "annual", "duration_value": 30, "duration_unit": "days", "min_days": 1, "max_days": 30, "default_balance": 30, "requires_approval": True, "is_active": True, "color": "#4F46E5"},
            {"id": "sick", "name": "Congé maladie", "code": "sick", "duration_value": 2, "duration_unit": "days", "min_days": 2, "max_days": 30, "default_balance": 2, "requires_approval": True, "is_active": True, "color": "#EF4444"},
            {"id": "maternity", "name": "Congé maternité", "code": "maternity", "duration_value": 3, "duration_unit": "months", "min_days": 90, "max_days": 120, "default_balance": 90, "requires_approval": True, "is_active": True, "color": "#EC4899"},
            {"id": "paternity", "name": "Congé paternité", "code": "paternity", "duration_value": 10, "duration_unit": "days", "min_days": 10, "max_days": 15, "default_balance": 10, "requires_approval": True, "is_active": True, "color": "#3B82F6"},
            {"id": "exceptional", "name": "Congé exceptionnel", "code": "exceptional", "duration_value": 15, "duration_unit": "days", "min_days": 1, "max_days": 15, "default_balance": 15, "requires_approval": True, "is_active": True, "color": "#F59E0B"},
            {"id": "collective", "name": "Congé collectif (tous)", "code": "collective", "duration_value": 1, "duration_unit": "days", "min_days": 1, "max_days": 30, "default_balance": 0, "requires_approval": False, "is_active": True, "color": "#10B981"}
        ]
        # Insert default types
        for lt in default_types:
            await db.leave_types.insert_one(lt)
        leave_types = default_types
    
    return {"leave_types": leave_types}

# Endpoint to calculate end date based on leave type and start date
@config_router.post("/calculate-leave-end-date")
async def calculate_leave_end_date(
    leave_type_code: str,
    start_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Calculate end date based on leave type configuration"""
    leave_type = await db.leave_types.find_one({"code": leave_type_code, "is_active": True}, {"_id": 0})
    
    if not leave_type:
        raise HTTPException(status_code=404, detail="Type de congé non trouvé")
    
    duration_value = leave_type.get("duration_value", 1)
    duration_unit = leave_type.get("duration_unit", "days")
    
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide")
    
    # Calculate end date based on unit
    if duration_unit == "days":
        end = start + timedelta(days=duration_value - 1)  # -1 because start day counts
        total_days = duration_value
    elif duration_unit == "weeks":
        end = start + timedelta(weeks=duration_value) - timedelta(days=1)
        total_days = duration_value * 7
    elif duration_unit == "months":
        # Add months
        month = start.month + duration_value
        year = start.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        # Handle day overflow
        import calendar
        max_day = calendar.monthrange(year, month)[1]
        day = min(start.day, max_day)
        end = start.replace(year=year, month=month, day=day) - timedelta(days=1)
        total_days = (end - start).days + 1
    else:
        end = start + timedelta(days=duration_value - 1)
        total_days = duration_value
    
    return {
        "start_date": start_date,
        "end_date": end.strftime("%Y-%m-%d"),
        "duration_value": duration_value,
        "duration_unit": duration_unit,
        "total_days": total_days,
        "leave_type": leave_type
    }

@config_router.post("/leave-types")
async def create_leave_type(
    leave_type: LeaveTypeConfig,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Create a new leave type"""
    leave_type_doc = leave_type.model_dump()
    leave_type_doc["id"] = str(uuid.uuid4())
    leave_type_doc["created_at"] = datetime.now(timezone.utc).isoformat()
    leave_type_doc["created_by"] = current_user["id"]
    
    await db.leave_types.insert_one(leave_type_doc)
    leave_type_doc.pop("_id", None)
    return leave_type_doc

@config_router.put("/leave-types/{leave_type_id}")
async def update_leave_type(
    leave_type_id: str,
    leave_type: LeaveTypeConfig,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Update a leave type"""
    update_data = leave_type.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    
    await db.leave_types.update_one(
        {"id": leave_type_id},
        {"$set": update_data}
    )
    return {"message": "Type de congé mis à jour"}

@config_router.delete("/leave-types/{leave_type_id}")
async def delete_leave_type(
    leave_type_id: str,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Deactivate a leave type"""
    await db.leave_types.update_one(
        {"id": leave_type_id},
        {"$set": {"is_active": False}}
    )
    return {"message": "Type de congé désactivé"}

@config_router.get("/leave-rules")
async def get_leave_rules(current_user: dict = Depends(require_roles(["admin"]))):
    rules = await db.leave_rules.find_one({"type": "default"}, {"_id": 0})
    if not rules:
        rules = LeaveRuleConfig().model_dump()
        rules["type"] = "default"
        await db.leave_rules.insert_one(rules)
    return rules

@config_router.put("/leave-rules")
async def update_leave_rules(
    rules: LeaveRuleConfig,
    current_user: dict = Depends(require_roles(["admin"]))
):
    rules_doc = rules.model_dump()
    rules_doc["type"] = "default"
    rules_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    rules_doc["updated_by"] = current_user["id"]
    
    await db.leave_rules.update_one(
        {"type": "default"},
        {"$set": rules_doc},
        upsert=True
    )
    return rules_doc

@config_router.get("/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    return {
        "categories": [
            {"id": "cadre", "name": "Cadre", "leave_multiplier": 1.2},
            {"id": "agent", "name": "Agent", "leave_multiplier": 1.0},
            {"id": "stagiaire", "name": "Stagiaire", "leave_multiplier": 0.5}
        ]
    }

# ==================== PERMISSIONS SYSTEM ====================

# Comprehensive modules and permissions structure
COMPREHENSIVE_PERMISSIONS = {
    "dashboard": {
        "label": "Tableau de Bord",
        "icon": "LayoutDashboard",
        "permissions": {
            "view_dashboard": {"label": "Voir le tableau de bord", "action": "view"},
            "view_statistics": {"label": "Voir les statistiques", "action": "view"},
        }
    },
    "communication": {
        "label": "Communication",
        "icon": "MessageSquare",
        "permissions": {
            "view_messages": {"label": "Voir les messages", "action": "view"},
            "create_message": {"label": "Créer un message", "action": "create"},
            "delete_message": {"label": "Supprimer un message", "action": "delete"},
            "view_announcements": {"label": "Voir les annonces", "action": "view"},
            "create_announcement": {"label": "Créer une annonce", "action": "create"},
            "edit_announcement": {"label": "Modifier une annonce", "action": "edit"},
            "delete_announcement": {"label": "Supprimer une annonce", "action": "delete"},
            "view_chat": {"label": "Accéder au chat", "action": "view"},
        }
    },
    "gestion_personnel": {
        "label": "Gestion du Personnel",
        "icon": "Users",
        "permissions": {
            "view_employees": {"label": "Voir la liste des employés", "action": "view"},
            "view_employee_details": {"label": "Voir les détails d'un employé", "action": "view"},
            "create_employee": {"label": "Créer un employé", "action": "create"},
            "edit_employee": {"label": "Modifier un employé", "action": "edit"},
            "delete_employee": {"label": "Supprimer un employé", "action": "delete"},
            "export_employees": {"label": "Exporter les employés", "action": "export"},
            "import_employees": {"label": "Importer des employés", "action": "import"},
            "view_employee_documents": {"label": "Voir les documents d'un employé", "action": "view"},
            "upload_employee_documents": {"label": "Uploader des documents", "action": "create"},
        }
    },
    "conges": {
        "label": "Gestion des Congés",
        "icon": "Calendar",
        "permissions": {
            "view_leaves": {"label": "Voir les congés", "action": "view"},
            "view_own_leaves": {"label": "Voir ses propres congés", "action": "view"},
            "create_leave": {"label": "Créer une demande de congé", "action": "create"},
            "edit_leave": {"label": "Modifier une demande", "action": "edit"},
            "delete_leave": {"label": "Supprimer une demande", "action": "delete"},
            "approve_leave": {"label": "Approuver un congé", "action": "approve"},
            "reject_leave": {"label": "Rejeter un congé", "action": "reject"},
            "view_leave_calendar": {"label": "Voir le calendrier des congés", "action": "view"},
            "export_leaves": {"label": "Exporter les congés", "action": "export"},
        }
    },
    "comportement": {
        "label": "Gestion des Comportements",
        "icon": "UserCheck",
        "permissions": {
            "view_behaviors": {"label": "Voir les comportements", "action": "view"},
            "create_behavior": {"label": "Créer un rapport", "action": "create"},
            "edit_behavior": {"label": "Modifier un rapport", "action": "edit"},
            "delete_behavior": {"label": "Supprimer un rapport", "action": "delete"},
            "view_behavior_documents": {"label": "Voir les documents", "action": "view"},
            "upload_behavior_documents": {"label": "Uploader des documents", "action": "create"},
            "export_behaviors": {"label": "Exporter les rapports", "action": "export"},
        }
    },
    "documents": {
        "label": "Documents RH",
        "icon": "FileText",
        "permissions": {
            "view_documents": {"label": "Voir les documents", "action": "view"},
            "create_document": {"label": "Créer un document", "action": "create"},
            "edit_document": {"label": "Modifier un document", "action": "edit"},
            "delete_document": {"label": "Supprimer un document", "action": "delete"},
            "view_templates": {"label": "Voir les modèles", "action": "view"},
            "create_template": {"label": "Créer un modèle", "action": "create"},
            "upload_docx": {"label": "Uploader des fichiers .docx", "action": "create"},
            "export_document": {"label": "Exporter un document", "action": "export"},
            "print_document": {"label": "Imprimer un document", "action": "print"},
        }
    },
    "sites": {
        "label": "Sites de Travail",
        "icon": "Building2",
        "permissions": {
            "view_sites": {"label": "Voir les sites", "action": "view"},
            "create_site": {"label": "Créer un site", "action": "create"},
            "edit_site": {"label": "Modifier un site", "action": "edit"},
            "delete_site": {"label": "Supprimer un site", "action": "delete"},
            "view_site_employees": {"label": "Voir les employés d'un site", "action": "view"},
        }
    },
    "departements": {
        "label": "Départements",
        "icon": "Briefcase",
        "permissions": {
            "view_departments": {"label": "Voir les départements", "action": "view"},
            "create_department": {"label": "Créer un département", "action": "create"},
            "edit_department": {"label": "Modifier un département", "action": "edit"},
            "delete_department": {"label": "Supprimer un département", "action": "delete"},
        }
    },
    "notifications": {
        "label": "Notifications",
        "icon": "Bell",
        "permissions": {
            "view_notifications": {"label": "Voir ses notifications", "action": "view"},
            "create_notification": {"label": "Créer une notification", "action": "create"},
            "create_custom_notification": {"label": "Créer une notification personnalisée", "action": "create"},
            "manage_notification_templates": {"label": "Gérer les modèles de notifications", "action": "manage"},
            "delete_notifications": {"label": "Supprimer des notifications", "action": "delete"},
        }
    },
    "permissions": {
        "label": "Gestion des Permissions",
        "icon": "Shield",
        "permissions": {
            "view_permissions": {"label": "Voir les permissions", "action": "view"},
            "edit_role_permissions": {"label": "Modifier les permissions d'un rôle", "action": "edit"},
            "scan_permissions": {"label": "Scanner et générer les permissions", "action": "scan"},
        }
    },
    "parametres": {
        "label": "Paramètres",
        "icon": "Settings",
        "permissions": {
            "view_settings": {"label": "Voir les paramètres", "action": "view"},
            "edit_profile": {"label": "Modifier son profil", "action": "edit"},
            "change_password": {"label": "Changer son mot de passe", "action": "edit"},
            "manage_system_settings": {"label": "Gérer les paramètres système", "action": "manage"},
            "manage_leave_rules": {"label": "Gérer les règles de congés", "action": "manage"},
        }
    }
}

# Default roles permissions
DEFAULT_ROLE_PERMISSIONS = {
    "super_admin": {
        "label": "Super Administrateur",
        "description": "Accès complet à toutes les fonctionnalités",
        "permissions": ["*"]  # Wildcard - toutes les permissions
    },
    "admin": {
        "label": "Administrateur",
        "description": "Gestion complète de l'application sauf paramètres système",
        "permissions": [
            # Dashboard
            "dashboard.view_dashboard", "dashboard.view_statistics",
            # Communication
            "communication.view_messages", "communication.create_message", "communication.delete_message",
            "communication.view_announcements", "communication.create_announcement", 
            "communication.edit_announcement", "communication.delete_announcement", "communication.view_chat",
            # Personnel
            "gestion_personnel.view_employees", "gestion_personnel.view_employee_details",
            "gestion_personnel.create_employee", "gestion_personnel.edit_employee",
            "gestion_personnel.delete_employee", "gestion_personnel.export_employees",
            "gestion_personnel.import_employees", "gestion_personnel.view_employee_documents",
            "gestion_personnel.upload_employee_documents",
            # Congés
            "conges.view_leaves", "conges.view_own_leaves", "conges.create_leave",
            "conges.edit_leave", "conges.delete_leave", "conges.approve_leave",
            "conges.reject_leave", "conges.view_leave_calendar", "conges.export_leaves",
            # Comportement
            "comportement.view_behaviors", "comportement.create_behavior", "comportement.edit_behavior",
            "comportement.delete_behavior", "comportement.view_behavior_documents",
            "comportement.upload_behavior_documents", "comportement.export_behaviors",
            # Documents
            "documents.view_documents", "documents.create_document", "documents.edit_document",
            "documents.delete_document", "documents.view_templates", "documents.create_template",
            "documents.upload_docx", "documents.export_document", "documents.print_document",
            # Sites & Départements
            "sites.view_sites", "sites.create_site", "sites.edit_site", "sites.delete_site",
            "sites.view_site_employees",
            "departements.view_departments", "departements.create_department",
            "departements.edit_department", "departements.delete_department",
            # Notifications
            "notifications.view_notifications", "notifications.create_notification",
            "notifications.create_custom_notification", "notifications.manage_notification_templates",
            # Permissions
            "permissions.view_permissions", "permissions.edit_role_permissions",
            # Paramètres
            "parametres.view_settings", "parametres.edit_profile", "parametres.change_password",
        ]
    },
    "secretary": {
        "label": "Secrétaire",
        "description": "Gestion du personnel et des congés",
        "permissions": [
            # Dashboard
            "dashboard.view_dashboard", "dashboard.view_statistics",
            # Communication
            "communication.view_messages", "communication.create_message",
            "communication.view_announcements", "communication.view_chat",
            # Personnel
            "gestion_personnel.view_employees", "gestion_personnel.view_employee_details",
            "gestion_personnel.create_employee", "gestion_personnel.edit_employee",
            "gestion_personnel.view_employee_documents", "gestion_personnel.upload_employee_documents",
            "gestion_personnel.export_employees",
            # Congés
            "conges.view_leaves", "conges.view_own_leaves", "conges.create_leave",
            "conges.view_leave_calendar",
            # Comportement
            "comportement.view_behaviors", "comportement.create_behavior",
            "comportement.view_behavior_documents",
            # Documents
            "documents.view_documents", "documents.create_document",
            "documents.view_templates", "documents.export_document", "documents.print_document",
            # Sites & Départements
            "sites.view_sites", "sites.view_site_employees",
            "departements.view_departments",
            # Notifications
            "notifications.view_notifications",
            # Paramètres
            "parametres.view_settings", "parametres.edit_profile", "parametres.change_password",
        ]
    },
    "employee": {
        "label": "Employé",
        "description": "Accès limité aux fonctionnalités personnelles",
        "permissions": [
            # Dashboard
            "dashboard.view_dashboard",
            # Communication
            "communication.view_messages", "communication.create_message",
            "communication.view_announcements", "communication.view_chat",
            # Personnel (limité)
            "gestion_personnel.view_employee_details",  # Seulement son profil
            # Congés
            "conges.view_own_leaves", "conges.create_leave",
            # Documents
            "documents.view_documents", "documents.print_document",
            # Notifications
            "notifications.view_notifications",
            # Paramètres
            "parametres.view_settings", "parametres.edit_profile", "parametres.change_password",
        ]
    }
}

# OLD SYSTEM (kept for backwards compatibility)
DEFAULT_PERMISSIONS = {
    "admin": {
        "can_manage_employees": True,
        "can_approve_leaves": True,
        "can_post_announcements": True,
        "can_post_behavior": True,
        "can_view_salaries": True,
        "can_edit_salaries": True,
        "can_delete_employees": True,
        "can_manage_permissions": True
    },
    "secretary": {
        "can_manage_employees": True,
        "can_approve_leaves": True,
        "can_post_announcements": True,
        "can_post_behavior": False,
        "can_view_salaries": False,
        "can_edit_salaries": False,
        "can_delete_employees": False,
        "can_manage_permissions": False
    },
    "employee": {
        "can_manage_employees": False,
        "can_approve_leaves": False,
        "can_post_announcements": False,
        "can_post_behavior": False,
        "can_view_salaries": False,
        "can_edit_salaries": False,
        "can_delete_employees": False,
        "can_manage_permissions": False
    }
}

# ==================== PERMISSIONS ROUTES (NEW DYNAMIC SYSTEM) ====================

@permissions_router.post("/scan", status_code=status.HTTP_201_CREATED)
async def scan_and_generate_permissions(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Scanner l'application et générer la liste complète des permissions depuis COMPREHENSIVE_PERMISSIONS
    Cette route peuple la base de données avec toutes les permissions disponibles
    """
    all_permissions = []
    
    # Parcourir tous les modules de COMPREHENSIVE_PERMISSIONS
    for module_key, module_data in COMPREHENSIVE_PERMISSIONS.items():
        module_label = module_data.get("label", module_key)
        module_icon = module_data.get("icon", "Circle")
        module_permissions = module_data.get("permissions", {})
        
        for perm_key, perm_data in module_permissions.items():
            permission_doc = {
                "id": f"{module_key}.{perm_key}",
                "module": module_key,
                "module_label": module_label,
                "module_icon": module_icon,
                "key": perm_key,
                "label": perm_data.get("label", perm_key),
                "action": perm_data.get("action", "execute"),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            all_permissions.append(permission_doc)
    
    # Supprimer les anciennes permissions et insérer les nouvelles
    await db.permissions_catalog.delete_many({})
    if all_permissions:
        await db.permissions_catalog.insert_many(all_permissions)
    
    # Initialiser les rôles avec les permissions par défaut s'ils n'existent pas
    for role_name, role_data in DEFAULT_ROLE_PERMISSIONS.items():
        existing_role = await db.roles.find_one({"role": role_name}, {"_id": 0})
        if not existing_role:
            role_doc = {
                "id": str(uuid.uuid4()),
                "role": role_name,
                "label": role_data.get("label", role_name),
                "description": role_data.get("description", ""),
                "permissions": role_data.get("permissions", []),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.roles.insert_one(role_doc)
        else:
            # Mettre à jour les permissions si le rôle existe déjà
            await db.roles.update_one(
                {"role": role_name},
                {"$set": {
                    "label": role_data.get("label", role_name),
                    "description": role_data.get("description", ""),
                    "permissions": role_data.get("permissions", []),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
    
    return {
        "message": "Scan terminé et permissions générées avec succès",
        "total_permissions": len(all_permissions),
        "total_modules": len(COMPREHENSIVE_PERMISSIONS),
        "roles_initialized": len(DEFAULT_ROLE_PERMISSIONS)
    }

@permissions_router.get("/structure")
async def get_permissions_structure(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Récupérer la structure complète des permissions groupées par module
    Retourne un format facile à utiliser pour le frontend
    """
    result = []
    
    for module_key, module_data in COMPREHENSIVE_PERMISSIONS.items():
        module_permissions = []
        for perm_key, perm_data in module_data.get("permissions", {}).items():
            module_permissions.append({
                "key": perm_key,
                "label": perm_data.get("label", perm_key),
                "action": perm_data.get("action", "execute"),
                "full_path": f"{module_key}.{perm_key}"
            })
        
        result.append({
            "module": module_key,
            "label": module_data.get("label", module_key),
            "icon": module_data.get("icon", "Circle"),
            "permissions": module_permissions
        })
    
    return {"modules": result}

@permissions_router.get("")
async def list_all_permissions(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Lister toutes les permissions disponibles depuis la base de données
    """
    permissions = await db.permissions_catalog.find({}, {"_id": 0}).to_list(1000)
    
    # Si aucune permission n'est trouvée, retourner depuis COMPREHENSIVE_PERMISSIONS
    if not permissions:
        return {
            "message": "Aucune permission trouvée. Veuillez exécuter /scan d'abord.",
            "permissions": []
        }
    
    return {"permissions": permissions, "total": len(permissions)}

@permissions_router.get("/roles")
async def list_all_roles(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Lister tous les rôles avec leurs permissions
    """
    roles = await db.roles.find({}, {"_id": 0}).to_list(100)
    
    # Si aucun rôle n'existe, initialiser depuis DEFAULT_ROLE_PERMISSIONS
    if not roles:
        for role_name, role_data in DEFAULT_ROLE_PERMISSIONS.items():
            role_doc = {
                "id": str(uuid.uuid4()),
                "role": role_name,
                "label": role_data.get("label", role_name),
                "description": role_data.get("description", ""),
                "permissions": role_data.get("permissions", []),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.roles.insert_one(role_doc)
        
        roles = await db.roles.find({}, {"_id": 0}).to_list(100)
    
    return {"roles": roles, "total": len(roles)}

@permissions_router.get("/roles/{role_name}")
async def get_role_permissions(
    role_name: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """
    Récupérer les permissions d'un rôle spécifique
    """
    role = await db.roles.find_one({"role": role_name}, {"_id": 0})
    
    if not role:
        # Si le rôle n'existe pas en base, retourner depuis DEFAULT_ROLE_PERMISSIONS
        if role_name in DEFAULT_ROLE_PERMISSIONS:
            role_data = DEFAULT_ROLE_PERMISSIONS[role_name]
            return {
                "role": role_name,
                "label": role_data.get("label", role_name),
                "description": role_data.get("description", ""),
                "permissions": role_data.get("permissions", [])
            }
        raise HTTPException(status_code=404, detail=f"Rôle '{role_name}' non trouvé")
    
    return role

@permissions_router.put("/roles/{role_name}")
async def update_role_permissions(
    role_name: str,
    data: RolePermissionsUpdate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """
    Mettre à jour les permissions d'un rôle
    """
    # Vérifier que le rôle existe
    role = await db.roles.find_one({"role": role_name}, {"_id": 0})
    
    if not role:
        raise HTTPException(status_code=404, detail=f"Rôle '{role_name}' non trouvé")
    
    # Mettre à jour les permissions
    await db.roles.update_one(
        {"role": role_name},
        {"$set": {
            "permissions": data.permissions,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }}
    )
    
    updated_role = await db.roles.find_one({"role": role_name}, {"_id": 0})
    
    return {
        "message": f"Permissions du rôle '{role_name}' mises à jour avec succès",
        "role": updated_role
    }

# ==================== PERMISSIONS ROUTES (OLD SYSTEM - KEPT FOR BACKWARDS COMPATIBILITY) ====================

@config_router.get("/permissions")
async def get_permissions(current_user: dict = Depends(get_current_user)):
    """Get role permissions"""
    permissions = await db.permissions.find_one({"type": "roles"}, {"_id": 0})
    if not permissions:
        permissions = {"type": "roles", "permissions": DEFAULT_PERMISSIONS}
    return permissions

@config_router.put("/permissions")
async def update_permissions(
    data: dict,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update role permissions (admin only)"""
    permissions_doc = {
        "type": "roles",
        "permissions": data.get("permissions", DEFAULT_PERMISSIONS),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    await db.permissions.update_one(
        {"type": "roles"},
        {"$set": permissions_doc},
        upsert=True
    )
    return {"message": "Permissions mises à jour", "permissions": permissions_doc["permissions"]}

# ==================== BEHAVIOR TRACKING ROUTES ====================
@behavior_router.get("")
async def list_behaviors(current_user: dict = Depends(get_current_user)):
    """List behavior notes - employees see only their own"""
    query = {}
    if current_user["role"] == "employee":
        query["employee_id"] = current_user["id"]
    
    behaviors = await db.behaviors.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return {"behaviors": behaviors}

@behavior_router.post("", status_code=status.HTTP_201_CREATED)
async def create_behavior_note(
    behavior: BehaviorNote,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Create a behavior note with document support"""
    employee = await db.users.find_one({"id": behavior.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    behavior_doc = {
        "id": str(uuid.uuid4()),
        "employee_id": behavior.employee_id,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "type": behavior.type,
        "note": behavior.note,
        "date": behavior.date,
        "file_name": behavior.file_name,
        "file_url": behavior.file_url,
        "document_urls": behavior.document_urls or [],
        "created_by": current_user["id"],
        "created_by_name": f"{current_user['first_name']} {current_user['last_name']}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.behaviors.insert_one(behavior_doc)
    behavior_doc.pop("_id", None)
    return behavior_doc

@behavior_router.get("/{employee_id}")
async def get_employee_behaviors(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get behavior history for an employee"""
    # Employees can only see their own
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    behaviors = await db.behaviors.find(
        {"employee_id": employee_id}, 
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    return {"behaviors": behaviors}

@behavior_router.delete("/{behavior_id}")
async def delete_behavior_note(
    behavior_id: str,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Delete a behavior note (admin/secretary only)"""
    behavior = await db.behaviors.find_one({"id": behavior_id}, {"_id": 0})
    if not behavior:
        raise HTTPException(status_code=404, detail="Note de comportement non trouvée")
    
    await db.behaviors.delete_one({"id": behavior_id})
    return {"message": "Note de comportement supprimée", "id": behavior_id}

# ==================== DOCUMENT UPLOAD ROUTES ====================
@employees_router.post("/{employee_id}/documents")
async def upload_document(
    employee_id: str,
    document: DocumentUpload,
    current_user: dict = Depends(get_current_user)
):
    """Upload a document to employee profile"""
    # Only employee can upload to their own profile, or admin/secretary
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    doc = {
        "id": str(uuid.uuid4()),
        "employee_id": employee_id,
        "name": document.name,
        "type": document.type,
        "url": document.url,
        "uploaded_by": current_user["id"],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    await db.documents.insert_one(doc)
    doc.pop("_id", None)
    return doc

@employees_router.get("/{employee_id}/documents")
async def get_employee_documents(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get documents for an employee"""
    # Employees can only see their own documents
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    documents = await db.documents.find({"employee_id": employee_id}, {"_id": 0}).to_list(100)
    return {"documents": documents}

@employees_router.put("/{employee_id}/documents/{document_id}")
async def update_document(
    employee_id: str,
    document_id: str,
    name: str,
    current_user: dict = Depends(get_current_user)
):
    """Rename a document"""
    # Check permissions
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    result = await db.documents.update_one(
        {"id": document_id, "employee_id": employee_id},
        {"$set": {"name": name, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    return {"message": "Document renommé", "name": name}

@employees_router.delete("/{employee_id}/documents/{document_id}")
async def delete_document(
    employee_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a document"""
    # Check permissions
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Get document to delete file from disk
    doc = await db.documents.find_one({"id": document_id, "employee_id": employee_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Delete from database
    await db.documents.delete_one({"id": document_id})
    
    # Optionally delete file from disk (be careful with shared files)
    # For now, we keep the file but remove the reference
    
    return {"message": "Document supprimé"}

# ==================== SALARY ROUTES (Admin calculate, Employee view own) ====================
@employees_router.get("/{employee_id}/salary")
async def get_employee_salary(
    employee_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get salary - employee can only see their own"""
    if current_user["role"] == "employee" and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé - Vous ne pouvez voir que votre propre salaire")
    
    employee = await db.users.find_one({"id": employee_id}, {"_id": 0, "password": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    return {
        "employee_id": employee_id,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "salary": employee.get("salary", 0),
        "salary_currency": employee.get("salary_currency", "USD"),
        "category": employee.get("category", "agent")
    }

@employees_router.put("/{employee_id}/salary")
async def update_employee_salary(
    employee_id: str,
    salary: float,
    currency: str = "USD",
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update salary (admin only)"""
    await db.users.update_one(
        {"id": employee_id},
        {"$set": {
            "salary": salary, 
            "salary_currency": currency,
            "salary_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Salaire mis à jour", "salary": salary, "salary_currency": currency}

# ==================== COMMUNICATION ROUTES ====================
@communication_router.get("/announcements")
async def list_announcements(current_user: dict = Depends(get_current_user)):
    """List all announcements"""
    announcements = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"announcements": announcements}

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: str = "normal"

@communication_router.post("/announcements", status_code=status.HTTP_201_CREATED)
async def create_announcement(
    announcement_data: AnnouncementCreate,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Create announcement (admin/secretary only)"""
    announcement = {
        "id": str(uuid.uuid4()),
        "title": announcement_data.title,
        "content": announcement_data.content,
        "priority": announcement_data.priority,
        "author_id": current_user["id"],
        "author_name": f"{current_user['first_name']} {current_user['last_name']}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.announcements.insert_one(announcement)
    announcement.pop("_id", None)
    return announcement

@communication_router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete an announcement (admin only)"""
    result = await db.announcements.delete_one({"id": announcement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")
    return {"message": "Annonce supprimée"}

# ==================== LIVE CHAT ROUTES ====================
class ChatMessage(BaseModel):
    content: str
    recipient_id: Optional[str] = None  # None means broadcast to all

@communication_router.get("/chat/messages")
async def get_chat_messages(
    recipient_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get chat messages - either broadcast or direct messages"""
    query = {}
    
    if recipient_id:
        # Direct messages between two users
        query = {
            "$or": [
                {"sender_id": current_user["id"], "recipient_id": recipient_id},
                {"sender_id": recipient_id, "recipient_id": current_user["id"]}
            ]
        }
    else:
        # Broadcast messages (recipient_id is None or "all")
        query = {"$or": [{"recipient_id": None}, {"recipient_id": "all"}]}
    
    messages = await db.chat_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()  # Show oldest first
    return {"messages": messages}

@communication_router.post("/chat/messages", status_code=status.HTTP_201_CREATED)
async def send_chat_message(
    message: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    """Send a chat message"""
    chat_msg = {
        "id": str(uuid.uuid4()),
        "sender_id": current_user["id"],
        "sender_name": f"{current_user['first_name']} {current_user['last_name']}",
        "sender_avatar": current_user.get("avatar_url"),
        "content": message.content,
        "recipient_id": message.recipient_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(chat_msg)
    chat_msg.pop("_id", None)
    return chat_msg

@communication_router.get("/chat/users")
async def get_chat_users(current_user: dict = Depends(get_current_user)):
    """Get list of users for chat"""
    users = await db.users.find(
        {"is_active": True, "id": {"$ne": current_user["id"]}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "avatar_url": 1, "role": 1, "department": 1}
    ).to_list(100)
    return {"users": users}

@communication_router.get("/chat/unread")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get unread message counts per user"""
    # Get all users who have sent messages to current user
    pipeline = [
        {
            "$match": {
                "recipient_id": current_user["id"],
                "sender_id": {"$ne": current_user["id"]},
                "read": {"$ne": True}
            }
        },
        {
            "$group": {
                "_id": "$sender_id",
                "count": {"$sum": 1},
                "last_message": {"$max": "$created_at"}
            }
        }
    ]
    
    unread_counts = {}
    async for doc in db.chat_messages.aggregate(pipeline):
        unread_counts[doc["_id"]] = {
            "count": doc["count"],
            "last_message": doc["last_message"]
        }
    
    # Total unread count
    total = sum(uc["count"] for uc in unread_counts.values())
    
    return {"unread": unread_counts, "total": total}

@communication_router.post("/chat/mark-read/{sender_id}")
async def mark_messages_read(
    sender_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark all messages from a specific sender as read"""
    result = await db.chat_messages.update_many(
        {
            "sender_id": sender_id,
            "recipient_id": current_user["id"],
            "read": {"$ne": True}
        },
        {"$set": {"read": True}}
    )
    return {"marked_read": result.modified_count}

# ==================== RÈGLEMENT INTÉRIEUR ====================

@communication_router.get("/reglement")
async def get_reglement(current_user: dict = Depends(get_current_user)):
    """Get all règlement intérieur documents"""
    documents = await db.reglement_interieur.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(100)
    return {"documents": documents}

@communication_router.post("/reglement")
async def upload_reglement(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Upload a règlement intérieur document (Admin only) - PDF, images, DOC/DOCX"""
    allowed_types = [
        "application/pdf",
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Types acceptés : PDF, images (JPG, PNG, GIF, WebP), DOC/DOCX"
        )
    
    # Determine file extension from content type
    ext_map = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
    }
    ext = ext_map.get(file.content_type, os.path.splitext(file.filename)[1] or ".bin")
    
    # Determine file category for the viewer
    if file.content_type == "application/pdf":
        file_type = "pdf"
    elif file.content_type.startswith("image/"):
        file_type = "image"
    else:
        file_type = "document"
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    filename = f"reglement_{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Get file size
    file_size = len(content)
    
    # Save to database
    document = {
        "id": file_id,
        "name": file.filename,
        "filename": filename,
        "url": f"/api/uploads/{filename}",
        "content_type": file.content_type,
        "file_type": file_type,
        "size": file_size,
        "uploaded_by": current_user["id"],
        "uploaded_by_name": f"{current_user['first_name']} {current_user['last_name']}",
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reglement_interieur.insert_one(document)
    document.pop("_id", None)
    
    return {"message": "Document uploadé avec succès", "document": document}

@communication_router.delete("/reglement/{document_id}")
async def delete_reglement(
    document_id: str,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Delete a règlement intérieur document (Admin only)"""
    # Find the document
    document = await db.reglement_interieur.find_one({"id": document_id})
    
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Delete the file
    filepath = os.path.join(UPLOAD_DIR, document["filename"])
    if os.path.exists(filepath):
        os.remove(filepath)
    
    # Delete from database
    await db.reglement_interieur.delete_one({"id": document_id})
    
    return {"message": "Document supprimé avec succès"}

# ==================== FILE UPLOAD ROUTES ====================
from fastapi import UploadFile, File
import base64
import os

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@upload_router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a file (PDF, JPEG, PNG, DOC, DOCX)"""
    allowed_types = [
        "application/pdf", 
        "image/jpeg", 
        "image/jpg", 
        "image/png", 
        "image/webp",
        "application/msword",  # .doc
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"  # .docx
    ]
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Type de fichier non supporté: {file.content_type}. Utilisez PDF, JPEG, PNG, DOC ou DOCX."
        )
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    filename = f"{file_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Return URL
    file_url = f"/api/uploads/{filename}"
    
    return {
        "success": True,
        "file_id": file_id,
        "filename": file.filename,
        "url": file_url,
        "content_type": file.content_type,
        "size": len(content)
    }

@upload_router.post("/avatar/{employee_id}")
async def upload_avatar(
    employee_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload profile picture"""
    # Users can upload their own avatar, admin can upload for anyone
    if current_user["role"] not in ["admin", "secretary"] and current_user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Utilisez JPEG, PNG ou WebP pour la photo de profil")
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"avatar_{employee_id}_{file_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    # Save file
    content = await file.read()
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Update user avatar URL
    avatar_url = f"/api/uploads/{filename}"
    await db.users.update_one(
        {"id": employee_id},
        {"$set": {"avatar_url": avatar_url}}
    )
    
    return {
        "success": True,
        "avatar_url": avatar_url,
        "message": "Photo de profil mise à jour"
    }

# ==================== FILE PREVIEW ENDPOINT ====================
@api_router.get("/preview/{filepath:path}")
async def preview_file(filepath: str):
    """
    Serve files with proper headers for browser preview
    Supports: PDF, images (JPEG, PNG, WebP)
    """
    # Clean and validate filepath
    filepath = filepath.strip('/')
    
    # Determine full path
    if filepath.startswith('api/uploads/'):
        filename = filepath.replace('api/uploads/', '')
    elif filepath.startswith('uploads/'):
        filename = filepath.replace('uploads/', '')
    else:
        filename = filepath
    
    full_path = os.path.join(UPLOAD_DIR, filename)
    
    # Check if file exists
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    
    # Determine content type based on file extension
    ext = filename.split('.')[-1].lower()
    content_type_map = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    
    content_type = content_type_map.get(ext, 'application/octet-stream')
    
    # Return file with inline disposition for browser preview
    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename=\"{filename}\"",
            "Cache-Control": "public, max-age=3600"
        }
    )

# Serve uploaded files
from fastapi.staticfiles import StaticFiles

# ==================== DASHBOARD STATS ====================
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    stats = {}
    
    # Common stats for everyone
    stats["total_announcements"] = await db.announcements.count_documents({})
    stats["total_reglements"] = await db.reglement_interieur.count_documents({})
    
    if current_user["role"] in ["admin", "secretary"]:
        stats["total_employees"] = await db.users.count_documents({"is_active": True})
        stats["pending_leaves"] = await db.leaves.count_documents({"status": "pending"})
        stats["approved_leaves"] = await db.leaves.count_documents({"status": "approved"})
        stats["rejected_leaves"] = await db.leaves.count_documents({"status": "rejected"})
        
        # Department breakdown
        dept_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$department", "count": {"$sum": 1}}}
        ]
        dept_stats = await db.users.aggregate(dept_pipeline).to_list(20)
        stats["employees_by_department"] = {d["_id"]: d["count"] for d in dept_stats if d["_id"]}
    else:
        # Employee sees only their stats
        user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
        stats["leave_balance"] = user.get("leave_balance", {})
        stats["leave_taken"] = user.get("leave_taken", {})
        stats["pending_requests"] = await db.leaves.count_documents({
            "employee_id": current_user["id"],
            "status": "pending"
        })
        stats["my_leaves_pending"] = await db.leaves.count_documents({
            "employee_id": current_user["id"],
            "status": "pending"
        })
        stats["behavior_notes"] = await db.behaviors.count_documents({
            "employee_id": current_user["id"]
        })
    
    return stats

# ==================== NOTIFICATIONS ROUTES ====================
@notifications_router.get("")
async def get_notifications(
    unread_only: bool = False,
    notification_type: Optional[str] = None,
    search: Optional[str] = None,
    period: Optional[str] = None,  # day, week, month, year
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for current user with filtering"""
    query = {"user_id": current_user["id"]}
    
    if unread_only:
        query["read"] = False
    
    if notification_type:
        query["type"] = notification_type
    
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"message": {"$regex": search, "$options": "i"}}
        ]
    
    # Period filtering
    if period:
        now = datetime.now(timezone.utc)
        if period == "day":
            start_date = now - timedelta(days=1)
        elif period == "week":
            start_date = now - timedelta(weeks=1)
        elif period == "month":
            start_date = now - timedelta(days=30)
        elif period == "year":
            start_date = now - timedelta(days=365)
        else:
            start_date = None
        
        if start_date:
            query["created_at"] = {"$gte": start_date.isoformat()}
    
    total = await db.notifications.count_documents(query)
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"user_id": current_user["id"], "read": False})
    
    return {
        "notifications": notifications, 
        "unread_count": unread_count,
        "total": total,
        "has_more": total > skip + limit
    }

@notifications_router.post("/create")
async def create_custom_notification(
    notification_data: NotificationCreate,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Create custom notification for specific users"""
    # Resolve target users
    user_ids = []
    
    if "all_admins" in notification_data.target_users:
        admins = await db.users.find(
            {"role": {"$in": ["admin", "super_admin"]}, "is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(100)
        user_ids.extend([admin["id"] for admin in admins])
    
    if "all_users" in notification_data.target_users:
        all_users = await db.users.find(
            {"is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        user_ids.extend([user["id"] for user in all_users])
    
    # Add specific user IDs
    for target in notification_data.target_users:
        if target not in ["all_admins", "all_users"]:
            user_ids.append(target)
    
    # Remove duplicates
    user_ids = list(set(user_ids))
    
    if not user_ids:
        raise HTTPException(status_code=400, detail="Aucun utilisateur cible spécifié")
    
    # Create notifications
    count = await create_notification(
        user_ids=user_ids,
        title=notification_data.title,
        message=notification_data.message,
        notification_type=notification_data.type,
        link=notification_data.link
    )
    
    return {"message": f"Notification envoyée à {count} utilisateur(s)", "count": count}

@notifications_router.get("/templates")
async def get_notification_templates(
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Get all notification templates"""
    templates = await db.notification_templates.find({}, {"_id": 0}).to_list(100)
    return {"templates": templates}

@notifications_router.post("/templates")
async def create_notification_template(
    template_data: NotificationTemplate,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Create notification template"""
    template = {
        "id": str(uuid.uuid4()),
        **template_data.model_dump(),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.notification_templates.insert_one(template)
    template.pop("_id", None)
    
    return {"message": "Template créé", "template": template}

@notifications_router.put("/templates/{template_id}")
async def update_notification_template(
    template_id: str,
    template_data: NotificationTemplate,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Update notification template"""
    update_data = template_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user["id"]
    
    result = await db.notification_templates.update_one(
        {"id": template_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template non trouvé")
    
    return {"message": "Template mis à jour"}

@notifications_router.delete("/templates/{template_id}")
async def delete_notification_template(
    template_id: str,
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Delete notification template"""
    result = await db.notification_templates.delete_one({"id": template_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template non trouvé")
    
    return {"message": "Template supprimé"}

@notifications_router.get("/{notification_id}")
async def get_notification_detail(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single notification detail"""
    notification = await db.notifications.find_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"_id": 0}
    )
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification non trouvée")
    
    # Mark as read when viewing details
    if not notification.get("read"):
        await db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        notification["read"] = True
    
    return notification

@notifications_router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marquée comme lue"}

@notifications_router.put("/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "Toutes les notifications marquées comme lues"}

@notifications_router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a notification"""
    await db.notifications.delete_one({"id": notification_id, "user_id": current_user["id"]})
    return {"message": "Notification supprimée"}

@notifications_router.delete("/clear-all")
async def clear_all_notifications(
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Clear all error notifications"""
    result = await db.notifications.delete_many({"type": {"$in": ["error", "warning"]}})
    return {"message": f"{result.deleted_count} notification(s) d'erreur supprimée(s)"}

# ==================== LEAVE REMINDER SCHEDULER ====================
async def send_leave_reminders_background():
    """Send reminders for leaves starting tomorrow - called by background scheduler"""
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    tomorrow_str = tomorrow.isoformat()
    
    # Find leaves starting tomorrow
    leaves = await db.leaves.find(
        {
            "status": "approved",
            "start_date": tomorrow_str
        },
        {"_id": 0}
    ).to_list(100)
    
    for leave in leaves:
        employee = await db.users.find_one({"id": leave["employee_id"]}, {"_id": 0})
        if not employee:
            continue
        
        employee_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        leave_type = leave.get("type", "Congé")
        start_date = leave.get("start_date", "")
        end_date = leave.get("end_date", "")
        
        # Notification pour l'admin
        await create_admin_notification(
            title=f"📅 Rappel: Congé de {employee_name} demain",
            message=f"{employee_name} commence son {leave_type} demain ({start_date} au {end_date})",
            notification_type="info",
            link="/time-management"
        )
        
        # Notification pour l'employé
        await create_notification(
            user_ids=[leave["employee_id"]],
            title=f"📅 Rappel: Votre congé commence demain",
            message=f"Votre {leave_type} commence demain ({start_date} au {end_date})",
            notification_type="info",
            link="/time-management"
        )
    
    return len(leaves)

@notifications_router.post("/test-leave-reminders")
async def test_leave_reminders(
    current_user: dict = Depends(require_roles(["admin", "super_admin"]))
):
    """Admin: Test leave reminder system"""
    count = await send_leave_reminders_background()
    return {"message": f"Rappels envoyés pour {count} congé(s)"}


# ==================== SITES & HIERARCHICAL GROUPS ROUTES ====================
class SiteCreate(BaseModel):
    name: str
    city: str
    country: str = "RDC"
    address: Optional[str] = None
    is_active: bool = True

class HierarchicalGroupCreate(BaseModel):
    name: str
    site_id: str
    department: str
    manager_id: Optional[str] = None
    member_ids: List[str] = []

@sites_router.get("")
async def list_sites(current_user: dict = Depends(get_current_user)):
    """List all work sites"""
    sites = await db.sites.find({"is_active": True}, {"_id": 0}).to_list(100)
    return {"sites": sites}

@sites_router.post("", status_code=status.HTTP_201_CREATED)
async def create_site(
    site: SiteCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a new work site"""
    site_doc = {
        "id": str(uuid.uuid4()),
        **site.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.sites.insert_one(site_doc)
    site_doc.pop("_id", None)
    return site_doc

@sites_router.put("/{site_id}")
async def update_site(
    site_id: str,
    site: SiteCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update a work site"""
    update_data = site.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.sites.update_one({"id": site_id}, {"$set": update_data})
    return {"message": "Site mis à jour"}

@sites_router.delete("/{site_id}")
async def delete_site(
    site_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Deactivate a work site"""
    await db.sites.update_one({"id": site_id}, {"$set": {"is_active": False}})
    return {"message": "Site désactivé"}

# Hierarchical Groups
@sites_router.get("/groups")
async def list_hierarchical_groups(
    site_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List hierarchical groups"""
    query = {}
    if site_id:
        query["site_id"] = site_id
    
    groups = await db.hierarchical_groups.find(query, {"_id": 0}).to_list(100)
    
    # Enrich with manager and member details
    for group in groups:
        if group.get("manager_id"):
            manager = await db.users.find_one({"id": group["manager_id"]}, {"_id": 0, "password": 0})
            group["manager"] = manager
        
        if group.get("member_ids"):
            members = await db.users.find(
                {"id": {"$in": group["member_ids"]}}, 
                {"_id": 0, "password": 0}
            ).to_list(100)
            group["members"] = members
    
    return {"groups": groups}

@sites_router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_hierarchical_group(
    group: HierarchicalGroupCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a hierarchical group"""
    # Verify site exists
    site = await db.sites.find_one({"id": group.site_id, "is_active": True})
    if not site:
        raise HTTPException(status_code=404, detail="Site non trouvé")
    
    group_doc = {
        "id": str(uuid.uuid4()),
        **group.model_dump(),
        "site_name": site["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    await db.hierarchical_groups.insert_one(group_doc)
    
    # Update employees with their group
    if group.member_ids:
        await db.users.update_many(
            {"id": {"$in": group.member_ids}},
            {"$set": {"hierarchical_group_id": group_doc["id"], "site_id": group.site_id}}
        )
    
    if group.manager_id:
        await db.users.update_one(
            {"id": group.manager_id},
            {"$set": {"hierarchical_group_id": group_doc["id"], "site_id": group.site_id, "is_manager": True}}
        )
    
    group_doc.pop("_id", None)
    return group_doc

@sites_router.put("/groups/{group_id}")
async def update_hierarchical_group(
    group_id: str,
    group: HierarchicalGroupCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update a hierarchical group"""
    existing = await db.hierarchical_groups.find_one({"id": group_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Groupe non trouvé")
    
    # Remove old members from group
    if existing.get("member_ids"):
        await db.users.update_many(
            {"id": {"$in": existing["member_ids"]}},
            {"$unset": {"hierarchical_group_id": "", "site_id": ""}}
        )
    if existing.get("manager_id"):
        await db.users.update_one(
            {"id": existing["manager_id"]},
            {"$unset": {"hierarchical_group_id": "", "is_manager": ""}}
        )
    
    # Update group
    update_data = group.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.hierarchical_groups.update_one({"id": group_id}, {"$set": update_data})
    
    # Add new members to group
    if group.member_ids:
        await db.users.update_many(
            {"id": {"$in": group.member_ids}},
            {"$set": {"hierarchical_group_id": group_id, "site_id": group.site_id}}
        )
    if group.manager_id:
        await db.users.update_one(
            {"id": group.manager_id},
            {"$set": {"hierarchical_group_id": group_id, "site_id": group.site_id, "is_manager": True}}
        )
    
    return {"message": "Groupe mis à jour"}

@sites_router.delete("/groups/{group_id}")
async def delete_hierarchical_group(
    group_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a hierarchical group"""
    group = await db.hierarchical_groups.find_one({"id": group_id})
    if group:
        # Remove group reference from members
        if group.get("member_ids"):
            await db.users.update_many(
                {"id": {"$in": group["member_ids"]}},
                {"$unset": {"hierarchical_group_id": "", "site_id": ""}}
            )
        if group.get("manager_id"):
            await db.users.update_one(
                {"id": group["manager_id"]},
                {"$unset": {"hierarchical_group_id": "", "is_manager": ""}}
            )
    
    await db.hierarchical_groups.delete_one({"id": group_id})
    return {"message": "Groupe supprimé"}

# ==================== DEPARTMENTS MANAGEMENT ====================
departments_router = APIRouter(prefix="/departments", tags=["Départements"])

class DepartmentCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None

@departments_router.get("")
async def list_departments(current_user: dict = Depends(get_current_user)):
    """Get all departments"""
    departments = await db.departments.find({}, {"_id": 0}).to_list(100)
    
    # If no departments in DB, return default list
    if not departments:
        default_departments = [
            {"code": "marketing", "name": "Marketing", "description": "Marketing et communication"},
            {"code": "comptabilite", "name": "Comptabilité", "description": "Comptabilité et finances"},
            {"code": "administration", "name": "Administration", "description": "Administration générale"},
            {"code": "ressources_humaines", "name": "Ressources Humaines", "description": "Gestion RH"},
            {"code": "juridique", "name": "Juridique", "description": "Service juridique"},
            {"code": "nettoyage", "name": "Nettoyage", "description": "Services de nettoyage"},
            {"code": "securite", "name": "Sécurité", "description": "Sécurité et surveillance"},
            {"code": "chauffeur", "name": "Chauffeur", "description": "Chauffeurs et transport"},
            {"code": "technicien", "name": "Technicien", "description": "Services techniques"},
            {"code": "direction", "name": "Direction", "description": "Direction générale"},
            {"code": "logistique", "name": "Logistique", "description": "Logistique et approvisionnement"},
            {"code": "production", "name": "Production", "description": "Production"},
            {"code": "commercial", "name": "Commercial", "description": "Service commercial"},
            {"code": "informatique", "name": "Informatique", "description": "Informatique et IT"}
        ]
        return {"departments": default_departments}
    
    return {"departments": departments}

@departments_router.post("", status_code=status.HTTP_201_CREATED)
async def create_department(
    dept: DepartmentCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a new department (admin only)"""
    # Check if code already exists
    existing = await db.departments.find_one({"code": dept.code})
    if existing:
        raise HTTPException(status_code=400, detail="Ce code de département existe déjà")
    
    dept_doc = {
        "id": str(uuid.uuid4()),
        "code": dept.code,
        "name": dept.name,
        "description": dept.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.departments.insert_one(dept_doc)
    dept_doc.pop("_id", None)
    return dept_doc

@departments_router.put("/{dept_id}")
async def update_department(
    dept_id: str,
    dept: DepartmentCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update a department (admin only)"""
    existing = await db.departments.find_one({"id": dept_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Département non trouvé")
    
    update_data = dept.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.departments.update_one({"id": dept_id}, {"$set": update_data})
    return {"message": "Département mis à jour"}

@departments_router.delete("/{dept_id}")
async def delete_department(
    dept_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a department (admin only)"""
    # Check if department is used by employees
    employees_count = await db.users.count_documents({"department": dept_id})
    if employees_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer ce département, {employees_count} employé(s) y sont affectés"
        )
    
    await db.departments.delete_one({"id": dept_id})
    return {"message": "Département supprimé"}

# ==================== PAYS ROUTES ====================
countries_router = APIRouter(prefix="/countries", tags=["Pays"])

class CountryCreate(BaseModel):
    code: str
    name: str

@countries_router.get("")
async def list_countries(current_user: dict = Depends(get_current_user)):
    """Get all countries"""
    countries = await db.countries.find({}, {"_id": 0}).to_list(200)
    
    # If no countries in DB, return default list
    if not countries:
        default_countries = [
            {"code": "CD", "name": "RD Congo"},
            {"code": "CG", "name": "Congo Brazzaville"},
            {"code": "RW", "name": "Rwanda"},
            {"code": "BI", "name": "Burundi"},
            {"code": "UG", "name": "Ouganda"},
            {"code": "KE", "name": "Kenya"},
            {"code": "TZ", "name": "Tanzanie"},
            {"code": "ZM", "name": "Zambie"},
            {"code": "AO", "name": "Angola"},
            {"code": "CF", "name": "Centrafrique"},
            {"code": "CM", "name": "Cameroun"},
            {"code": "GA", "name": "Gabon"},
            {"code": "SN", "name": "Sénégal"},
            {"code": "CI", "name": "Côte d'Ivoire"},
            {"code": "BF", "name": "Burkina Faso"},
            {"code": "ML", "name": "Mali"},
            {"code": "NE", "name": "Niger"},
            {"code": "TD", "name": "Tchad"},
            {"code": "BJ", "name": "Bénin"},
            {"code": "TG", "name": "Togo"},
            {"code": "GH", "name": "Ghana"},
            {"code": "NG", "name": "Nigeria"},
            {"code": "ZA", "name": "Afrique du Sud"},
            {"code": "MA", "name": "Maroc"},
            {"code": "DZ", "name": "Algérie"},
            {"code": "TN", "name": "Tunisie"},
            {"code": "EG", "name": "Égypte"},
            {"code": "FR", "name": "France"},
            {"code": "BE", "name": "Belgique"},
            {"code": "US", "name": "États-Unis"},
            {"code": "CN", "name": "Chine"},
            {"code": "IN", "name": "Inde"}
        ]
        return {"countries": default_countries}
    
    return {"countries": countries}

@countries_router.post("", status_code=status.HTTP_201_CREATED)
async def create_country(
    country: CountryCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a new country (admin only)"""
    # Check if code already exists
    existing = await db.countries.find_one({"code": country.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Ce code pays existe déjà")
    
    country_doc = {
        "id": str(uuid.uuid4()),
        "code": country.code.upper(),
        "name": country.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.countries.insert_one(country_doc)
    country_doc.pop("_id", None)
    return country_doc

@countries_router.delete("/{country_id}")
async def delete_country(
    country_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a country (admin only)"""
    # Check if country is used by employees
    employees_count = await db.users.count_documents({"country": country_id})
    if employees_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer ce pays, {employees_count} employé(s) y sont associés"
        )
    
    result = await db.countries.delete_one({"id": country_id})
    if result.deleted_count == 0:
        # Try to delete by code
        await db.countries.delete_one({"code": country_id})
    
    return {"message": "Pays supprimé"}

# ==================== DOCUMENTS RH ROUTES ====================
documents_router = APIRouter(prefix="/hr-documents", tags=["Documents RH"])

# ========== SIGNATURE SETTINGS ==========
@documents_router.post("/signature-settings")
async def update_signature_settings(
    settings: SignatureSettings,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Upload/Update signature and stamp images"""
    await db.signature_settings.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "user_id": current_user["id"],
            "signature_image_url": settings.signature_image_url,
            "stamp_image_url": settings.stamp_image_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    return {"message": "Paramètres de signature mis à jour"}

@documents_router.get("/signature-settings")
async def get_signature_settings(
    current_user: dict = Depends(get_current_user)
):
    """Get signature settings for current user"""
    settings = await db.signature_settings.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return settings or {}

# ========== SIGNATURE PASSWORD ==========
@documents_router.post("/signature-password")
async def create_signature_password(
    pwd_data: SignaturePasswordCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create or update signature password"""
    if pwd_data.password != pwd_data.confirm_password:
        raise HTTPException(status_code=400, detail="Les mots de passe ne correspondent pas")
    
    if len(pwd_data.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")
    
    hashed_password = get_password_hash(pwd_data.password)
    
    await db.signature_passwords.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "user_id": current_user["id"],
            "hashed_password": hashed_password,
            "created_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"message": "Mot de passe de signature créé avec succès"}

@documents_router.post("/signature-password/verify")
async def verify_signature_password(
    pwd_data: SignaturePasswordVerify,
    current_user: dict = Depends(get_current_user)
):
    """Verify signature password"""
    pwd_record = await db.signature_passwords.find_one({"user_id": current_user["id"]}, {"_id": 0})
    
    if not pwd_record:
        raise HTTPException(status_code=404, detail="Mot de passe de signature non configuré")
    
    if not verify_password(pwd_data.password, pwd_record["hashed_password"]):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    return {"message": "Mot de passe vérifié"}

@documents_router.get("/signature-password/exists")
async def check_signature_password_exists(
    current_user: dict = Depends(get_current_user)
):
    """Check if user has set up signature password"""
    pwd_record = await db.signature_passwords.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return {"exists": pwd_record is not None}

@documents_router.put("/signature-password/update")
async def update_signature_password(
    pwd_data: SignaturePasswordUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update signature password"""
    pwd_record = await db.signature_passwords.find_one({"user_id": current_user["id"]}, {"_id": 0})
    
    if not pwd_record:
        raise HTTPException(status_code=404, detail="Mot de passe de signature non configuré")
    
    # Verify old password
    if not verify_password(pwd_data.old_password, pwd_record["hashed_password"]):
        raise HTTPException(status_code=401, detail="Ancien mot de passe incorrect")
    
    # Validate new password
    if pwd_data.new_password != pwd_data.confirm_password:
        raise HTTPException(status_code=400, detail="Les nouveaux mots de passe ne correspondent pas")
    
    if len(pwd_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")
    
    # Update password
    hashed_password = get_password_hash(pwd_data.new_password)
    await db.signature_passwords.update_one(
        {"user_id": current_user["id"]},
        {"$set": {
            "hashed_password": hashed_password,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Mot de passe de signature modifié avec succès"}

@documents_router.post("/signature-password/reset")
async def reset_signature_password(
    pwd_data: SignaturePasswordReset,
    current_user: dict = Depends(require_roles(["super_admin", "admin"]))
):
    """Reset signature password for another user (Admin only)"""
    # Validate passwords match
    if pwd_data.new_password != pwd_data.confirm_password:
        raise HTTPException(status_code=400, detail="Les mots de passe ne correspondent pas")
    
    if len(pwd_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")
    
    # Check if target user exists
    target_user = await db.users.find_one({"id": pwd_data.user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Reset password
    hashed_password = get_password_hash(pwd_data.new_password)
    await db.signature_passwords.update_one(
        {"user_id": pwd_data.user_id},
        {"$set": {
            "user_id": pwd_data.user_id,
            "hashed_password": hashed_password,
            "reset_by": current_user["id"],
            "reset_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"message": f"Mot de passe de signature réinitialisé pour {target_user['first_name']} {target_user['last_name']}"}

@documents_router.get("/employee-data/{employee_id}")
async def get_employee_data(
    employee_id: str,
    source_module: str,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Get employee data from specified source module for auto-filling"""
    # Get employee basic info
    employee = await db.users.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    result = {
        "employee": {
            "id": employee["id"],
            "name": f"{employee['first_name']} {employee['last_name']}",
            "first_name": employee["first_name"],
            "last_name": employee["last_name"],
            "email": employee["email"],
            "phone": employee.get("phone", ""),
            "department": employee.get("department", ""),
            "position": employee.get("position", ""),
            "hire_date": employee.get("hire_date", ""),
            "category": employee.get("category", ""),
            "matricule": employee.get("id", "")[:8].upper()  # Generate matricule from ID
        },
        "module_data": {}
    }
    
    # Fetch data from source module
    if source_module == "leaves":
        leaves = await db.leaves.find({"employee_id": employee_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
        result["module_data"] = {
            "recent_leaves": leaves,
            "total_leaves": len(leaves),
            "leave_balance": employee.get("leave_balance", {}),
            "leave_taken": employee.get("leave_taken", {})
        }
    elif source_module == "behaviors":
        behaviors = await db.behaviors.find({"employee_id": employee_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
        result["module_data"] = {
            "recent_behaviors": behaviors,
            "total_behaviors": len(behaviors)
        }
    elif source_module == "payroll":
        # Get payroll data if exists
        result["module_data"] = {
            "salary": employee.get("salary", 0),
            "salary_currency": employee.get("salary_currency", "USD")
        }
    elif source_module == "attendance":
        # Get recent attendance
        attendance = await db.attendance.find({"employee_id": employee_id}, {"_id": 0}).sort("date", -1).to_list(30)
        result["module_data"] = {
            "recent_attendance": attendance,
            "total_days": len(attendance)
        }
    elif source_module == "employees":
        # Just employee basic info (already included)
        result["module_data"] = {"note": "Données employé de base uniquement"}
    
    return result

# ========== TEMPLATES ==========
@documents_router.get("/templates")
async def list_templates(
    source_module: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all document templates, optionally filtered by source module"""
    query = {}
    if source_module:
        query["source_module"] = source_module
    
    templates = await db.document_templates.find(query, {"_id": 0}).to_list(100)
    return {"templates": templates}

@documents_router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    template: DocumentTemplate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a document template"""
    template_doc = {
        "id": str(uuid.uuid4()),
        **template.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.document_templates.insert_one(template_doc)
    template_doc.pop("_id", None)
    return template_doc

@documents_router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    template: DocumentTemplate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update a document template"""
    existing = await db.document_templates.find_one({"id": template_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    update_data = template.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.document_templates.update_one({"id": template_id}, {"$set": update_data})
    return {"message": "Modèle mis à jour"}

@documents_router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a document template"""
    await db.document_templates.delete_one({"id": template_id})
    return {"message": "Modèle supprimé"}

# ========== DOCUMENTS ==========
@documents_router.post("", status_code=status.HTTP_201_CREATED)
async def create_document(
    doc: DocumentCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a document (Admin only - Zone 1)"""
    # Get template
    template = await db.document_templates.find_one({"id": doc.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    # Get employee
    employee = await db.users.find_one({"id": doc.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    # Get source data if provided
    source_data = {}
    if doc.source_id and doc.source_module:
        if doc.source_module == "leaves":
            source_data = await db.leaves.find_one({"id": doc.source_id}, {"_id": 0}) or {}
        elif doc.source_module == "behaviors":
            source_data = await db.behaviors.find_one({"id": doc.source_id}, {"_id": 0}) or {}
    
    # Prepare replacement data
    replacements = {
        "beneficiary_name": doc.beneficiary_name,
        "beneficiary_matricule": doc.beneficiary_matricule,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "employee_first_name": employee['first_name'],
        "employee_last_name": employee['last_name'],
        "employee_email": employee['email'],
        "employee_phone": employee.get('phone', ''),
        "employee_department": employee.get('department', ''),
        "employee_position": employee.get('position', ''),
        "employee_hire_date": employee.get('hire_date', ''),
        "document_type": doc.document_type,
        "period_start": doc.period_start or '',
        "period_end": doc.period_end or '',
        "reason": doc.reason,
        "current_date": datetime.now().strftime('%d/%m/%Y'),
        **source_data,
        **doc.custom_data
    }
    
    # Replace placeholders in content
    content = template["content"]
    for key, value in replacements.items():
        placeholder = f"{{{{{key}}}}}"  # Format: {{employee_name}}
        content = content.replace(placeholder, str(value))
    
    # Create document without signature (Zone 1)
    document_doc = {
        "id": str(uuid.uuid4()),
        "template_id": doc.template_id,
        "template_name": template["name"],
        "employee_id": doc.employee_id,
        "employee_name": f"{employee['first_name']} {employee['last_name']}",
        "beneficiary_name": doc.beneficiary_name,
        "beneficiary_matricule": doc.beneficiary_matricule,
        "document_type": doc.document_type,
        "period_start": doc.period_start,
        "period_end": doc.period_end,
        "reason": doc.reason,
        "source_module": doc.source_module,
        "source_id": doc.source_id,
        "content": content,
        "original_template": template["content"],
        "status": "pending_approval",  # En attente d'approbation
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "created_by_name": f"{current_user['first_name']} {current_user['last_name']}"
    }
    
    await db.hr_documents.insert_one(document_doc)
    document_doc.pop("_id", None)
    return document_doc

@documents_router.get("")
async def list_documents(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List documents with permission-based filtering"""
    query = {}
    
    # Admin and managers can see all documents or filter by employee
    if current_user["role"] in ["super_admin", "admin"]:
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
    # Secretaries can only see their own created documents
    elif current_user["role"] == "secretary":
        query["$or"] = [
            {"created_by": current_user["id"]},
            {"employee_id": current_user["id"]}
        ]
        if status:
            query["status"] = status
    # Regular employees can only see their own documents
    else:
        query["employee_id"] = current_user["id"]
    
    documents = await db.hr_documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"documents": documents}

@documents_router.get("/{document_id}")
async def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific document"""
    document = await db.hr_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Check permissions
    if current_user["role"] not in ["super_admin", "admin"]:
        if document["employee_id"] != current_user["id"] and document.get("created_by") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Accès refusé")
    
    return document

@documents_router.put("/{document_id}")
async def update_document(
    document_id: str,
    update: DocumentUpdate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Update document content (Admin only - before approval)"""
    document = await db.hr_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Can only update if not yet approved
    if document.get("status") == "approved":
        raise HTTPException(status_code=400, detail="Impossible de modifier un document approuvé")
    
    update_data = {}
    if update.content:
        update_data["content"] = update.content
    if update.status:
        update_data["status"] = update.status
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.hr_documents.update_one({"id": document_id}, {"$set": update_data})
    return {"message": "Document mis à jour"}

@documents_router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a document (Admin only)"""
    document = await db.hr_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Can only delete if not yet approved
    if document.get("status") == "approved":
        raise HTTPException(status_code=400, detail="Impossible de supprimer un document approuvé")
    
    await db.hr_documents.delete_one({"id": document_id})
    return {"message": "Document supprimé"}

# ========== APPROVAL WORKFLOW ==========
@documents_router.post("/approve")
async def approve_document(
    approval: DocumentApproval,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Approve or reject document with signature (Boss/Responsable)"""
    # Verify signature password
    pwd_record = await db.signature_passwords.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not pwd_record:
        raise HTTPException(status_code=400, detail="Mot de passe de signature non configuré. Veuillez le créer d'abord.")
    
    if not verify_password(approval.signature_password, pwd_record["hashed_password"]):
        raise HTTPException(status_code=401, detail="Mot de passe de signature incorrect")
    
    # Get document
    document = await db.hr_documents.find_one({"id": approval.document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Get signature settings
    signature_settings = await db.signature_settings.find_one({"user_id": current_user["id"]}, {"_id": 0})
    
    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "approval_action": approval.action,
        "approval_comment": approval.comment,
        "approved_by": current_user["id"],
        "approved_by_name": f"{current_user['first_name']} {current_user['last_name']}",
        "approved_at": datetime.now(timezone.utc).isoformat()
    }
    
    if approval.action == "approve":
        update_data["status"] = "approved"
        # Add signature and stamp if available
        if signature_settings:
            update_data["signature_image_url"] = signature_settings.get("signature_image_url")
            update_data["stamp_image_url"] = signature_settings.get("stamp_image_url")
    else:
        update_data["status"] = "rejected"
    
    await db.hr_documents.update_one({"id": approval.document_id}, {"$set": update_data})
    
    # Log approval history
    history_record = {
        "id": str(uuid.uuid4()),
        "document_id": approval.document_id,
        "action": approval.action,
        "performed_by": current_user["id"],
        "performed_by_name": f"{current_user['first_name']} {current_user['last_name']}",
        "comment": approval.comment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip_address": None  # Can be added if needed
    }
    await db.document_approval_history.insert_one(history_record)
    
    return {"message": f"Document {'approuvé' if approval.action == 'approve' else 'rejeté'} avec succès"}

@documents_router.get("/{document_id}/history")
async def get_document_history(
    document_id: str,
    current_user: dict = Depends(require_roles(["admin", "secretary"]))
):
    """Get approval history for a document"""
    history = await db.document_approval_history.find(
        {"document_id": document_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    
    return {"history": history}

@api_router.get("/")
async def root():
    return {"message": "PREMIDIS SARL - HR Platform", "version": "2.0.0"}

# ==================== INCLUDE ROUTERS ====================
api_router.include_router(auth_router)
api_router.include_router(employees_router)
api_router.include_router(leaves_router)
api_router.include_router(calendar_router)
api_router.include_router(hr_router)
api_router.include_router(config_router)
api_router.include_router(attendance_router)
api_router.include_router(behavior_router)
api_router.include_router(communication_router)
api_router.include_router(upload_router)
api_router.include_router(notifications_router)
api_router.include_router(sites_router)
api_router.include_router(departments_router)
api_router.include_router(countries_router)
api_router.include_router(documents_router)
api_router.include_router(permissions_router)  # Nouveau système de permissions dynamiques

# ==================== DOCUMENTS MODULE (WORD-LIKE) ROUTES ====================
documents_module_router = APIRouter(prefix="/documents", tags=["Documents Module"])

# ========== FORMS (Templates) ==========
@documents_module_router.get("/forms")
async def list_forms(current_user: dict = Depends(get_current_user)):
    """Get all document forms/templates"""
    forms = await db.document_forms.find({}, {"_id": 0}).to_list(100)
    return {"forms": forms}

@documents_module_router.post("/forms", status_code=status.HTTP_201_CREATED)
async def create_form(
    form: DocumentForm,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Create a new document form/template"""
    form_doc = {
        "id": str(uuid.uuid4()),
        **form.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.document_forms.insert_one(form_doc)
    form_doc.pop("_id", None)
    return form_doc

@documents_module_router.get("/forms/{form_id}")
async def get_form(
    form_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific form"""
    form = await db.document_forms.find_one({"id": form_id}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Forme non trouvée")
    return form

@documents_module_router.delete("/forms/{form_id}")
async def delete_form(
    form_id: str,
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Delete a form"""
    await db.document_forms.delete_one({"id": form_id})
    return {"message": "Forme supprimée"}

# ========== EDITOR DOCUMENTS (must be before generic /{document_id} routes) ==========
@documents_module_router.post("/upload-file")
async def upload_document_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a PDF, DOCX, or image file for editing with overlay"""
    allowed_types = {
        "application/pdf": "pdf",
        "image/jpeg": "image", "image/png": "image", "image/gif": "image", "image/webp": "image",
        "application/msword": "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
    }
    
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Types acceptés: PDF, images (JPG, PNG, GIF, WebP), DOC/DOCX")
    
    file_type = allowed_types[file.content_type]
    content = await file.read()
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] or ".bin"
    filename = f"doc_{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, 'wb') as f:
        f.write(content)
    
    # Convert PDF pages to images for overlay editing
    pages = []
    if file_type == "pdf":
        try:
            pdf_doc = fitz.open(stream=content, filetype="pdf")
            for i, page in enumerate(pdf_doc):
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_filename = f"doc_{file_id}_page_{i}.png"
                img_path = os.path.join(UPLOAD_DIR, img_filename)
                pix.save(img_path)
                pages.append({
                    "page_number": i + 1,
                    "image_url": f"/api/uploads/{img_filename}",
                    "width": pix.width,
                    "height": pix.height
                })
            pdf_doc.close()
        except Exception as e:
            logging.error(f"PDF conversion error: {e}")
            pages = [{"page_number": 1, "image_url": f"/api/uploads/{filename}", "width": 800, "height": 1100}]
    elif file_type == "image":
        from PIL import Image as PILImage
        img = PILImage.open(io.BytesIO(content))
        w, h = img.size
        pages = [{"page_number": 1, "image_url": f"/api/uploads/{filename}", "width": w, "height": h}]
    elif file_type == "docx":
        try:
            result = mammoth.convert_to_html(io.BytesIO(content))
            html_content = result.value
        except Exception:
            html_content = "<p>Impossible de convertir ce document</p>"
        pages = [{"page_number": 1, "html_content": html_content, "width": 800, "height": 1100}]
    
    doc_record = {
        "id": file_id,
        "name": file.filename,
        "filename": filename,
        "file_url": f"/api/uploads/{filename}",
        "file_type": file_type,
        "content_type": file.content_type,
        "size": len(content),
        "pages": pages,
        "page_count": len(pages),
        "overlay_elements": [],
        "author_id": current_user["id"],
        "author_name": f"{current_user['first_name']} {current_user['last_name']}",
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "history": []
    }
    
    await db.editor_documents.insert_one(doc_record)
    doc_record.pop("_id", None)
    return {"message": "Document uploadé", "document": doc_record}

@documents_module_router.get("/editor-docs")
async def list_editor_documents(current_user: dict = Depends(get_current_user)):
    """List all uploaded documents for the editor"""
    query = {}
    if current_user["role"] not in ["super_admin", "admin"]:
        query["author_id"] = current_user["id"]
    docs = await db.editor_documents.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return {"documents": docs}

@documents_module_router.get("/editor-docs/{doc_id}")
async def get_editor_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific editor document with overlay data"""
    doc = await db.editor_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    return doc

@documents_module_router.put("/editor-docs/{doc_id}/overlay")
async def save_overlay(doc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Save overlay elements for a document"""
    doc = await db.editor_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    history_entry = {
        "id": str(uuid.uuid4()),
        "overlay_elements": doc.get("overlay_elements", []),
        "saved_by": current_user["id"],
        "saved_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.editor_documents.update_one(
        {"id": doc_id},
        {
            "$set": {
                "overlay_elements": data.get("elements", []),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"history": history_entry}
        }
    )
    return {"message": "Overlay sauvegardé"}

@documents_module_router.delete("/editor-docs/{doc_id}")
async def delete_editor_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an editor document"""
    doc = await db.editor_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    try:
        filepath = os.path.join(UPLOAD_DIR, doc.get("filename", ""))
        if os.path.exists(filepath):
            os.remove(filepath)
        for page in doc.get("pages", []):
            img_url = page.get("image_url", "")
            if img_url:
                img_path = os.path.join(UPLOAD_DIR, img_url.split("/")[-1])
                if os.path.exists(img_path):
                    os.remove(img_path)
    except Exception:
        pass
    
    await db.editor_documents.delete_one({"id": doc_id})
    return {"message": "Document supprimé"}

@documents_module_router.get("/editor-docs/{doc_id}/history")
async def get_editor_history(doc_id: str, current_user: dict = Depends(get_current_user)):
    """Get version history for a document"""
    doc = await db.editor_documents.find_one({"id": doc_id}, {"_id": 0, "history": 1, "id": 1, "name": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    return {"history": doc.get("history", []), "document_name": doc.get("name")}

@documents_module_router.post("/editor-docs/{doc_id}/generate-pdf")
async def generate_pdf_with_overlay(doc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Generate a final PDF with overlay elements applied on the original document"""
    doc = await db.editor_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    elements = data.get("elements", doc.get("overlay_elements", []))
    
    try:
        original_path = os.path.join(UPLOAD_DIR, doc.get("filename", ""))
        output_id = str(uuid.uuid4())
        output_filename = f"generated_{output_id}.pdf"
        output_path = os.path.join(UPLOAD_DIR, output_filename)
        
        if doc.get("file_type") == "pdf" and os.path.exists(original_path):
            pdf_doc = fitz.open(original_path)
            
            for elem in elements:
                page_idx = elem.get("page", 1) - 1
                if page_idx < 0 or page_idx >= len(pdf_doc):
                    continue
                page = pdf_doc[page_idx]
                
                scale = 0.5
                x = elem.get("x", 0) * scale
                y = elem.get("y", 0) * scale
                
                if elem.get("type") == "text":
                    text = elem.get("content", "")
                    font_size = elem.get("fontSize", 14) * scale
                    color_hex = elem.get("color", "#000000").lstrip("#")
                    r, g, b = tuple(int(color_hex[i:i+2], 16) / 255 for i in (0, 2, 4))
                    page.insert_text(fitz.Point(x, y + font_size), text, fontsize=font_size, color=(r, g, b))
                elif elem.get("type") == "checkbox":
                    checked = elem.get("checked", False)
                    symbol = "☑" if checked else "☐"
                    page.insert_text(fitz.Point(x, y + 14), symbol, fontsize=14)
                elif elem.get("type") == "date":
                    text = elem.get("content", datetime.now().strftime("%d/%m/%Y"))
                    page.insert_text(fitz.Point(x, y + 12), text, fontsize=12)
                elif elem.get("type") == "image" and elem.get("imageData"):
                    try:
                        img_data = elem["imageData"]
                        if "base64," in img_data:
                            img_data = img_data.split("base64,")[1]
                        img_bytes = base64.b64decode(img_data)
                        w = elem.get("width", 100) * scale
                        h = elem.get("height", 100) * scale
                        rect = fitz.Rect(x, y, x + w, y + h)
                        page.insert_image(rect, stream=img_bytes)
                    except Exception as e:
                        logging.error(f"Image overlay error: {e}")
            
            pdf_doc.save(output_path)
            pdf_doc.close()
        else:
            from fpdf import FPDF
            pdf = FPDF()
            
            for page_info in doc.get("pages", []):
                pdf.add_page()
                img_url = page_info.get("image_url", "")
                if img_url:
                    img_path = os.path.join(UPLOAD_DIR, img_url.split("/")[-1])
                    if os.path.exists(img_path):
                        pdf.image(img_path, 0, 0, 210)
                
                page_num = page_info.get("page_number", 1)
                for elem in elements:
                    if elem.get("page", 1) != page_num:
                        continue
                    s = 210 / page_info.get("width", 800)
                    ex = elem.get("x", 0) * s
                    ey = elem.get("y", 0) * s
                    
                    if elem.get("type") in ["text", "date"]:
                        pdf.set_xy(ex, ey)
                        pdf.set_font("Helvetica", size=int(elem.get("fontSize", 12) * s))
                        pdf.cell(0, 5, elem.get("content", ""))
            
            pdf.output(output_path)
        
        return {
            "message": "PDF généré avec succès",
            "pdf_url": f"/api/uploads/{output_filename}",
            "filename": output_filename
        }
    except Exception as e:
        logging.error(f"PDF generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de génération: {str(e)}")

# ========== DOCUMENTS ==========
@documents_module_router.get("")
async def list_all_documents(
    current_user: dict = Depends(get_current_user)
):
    """Get all documents (historique)"""
    query = {}
    
    # Non-admin users see only their own documents
    if current_user["role"] not in ["super_admin", "admin"]:
        query["author_id"] = current_user["id"]
    
    documents = await db.documents.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return {"documents": documents}

@documents_module_router.post("", status_code=status.HTTP_201_CREATED)
async def create_new_document(
    doc: DocumentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new document"""
    document_doc = {
        "id": str(uuid.uuid4()),
        "form_id": doc.form_id,
        "title": doc.title,
        "content": doc.content,
        "author_id": current_user["id"],
        "author_name": f"{current_user['first_name']} {current_user['last_name']}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.documents.insert_one(document_doc)
    document_doc.pop("_id", None)
    return document_doc

@documents_module_router.get("/{document_id}")
async def get_single_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Check permissions
    if current_user["role"] not in ["super_admin", "admin"]:
        if document["author_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Accès refusé")
    
    return document

@documents_module_router.put("/{document_id}")
async def update_existing_document(
    document_id: str,
    update: DocumentUpdateContent,
    current_user: dict = Depends(get_current_user)
):
    """Update document content"""
    document = await db.documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Check permissions
    if current_user["role"] not in ["super_admin", "admin"]:
        if document["author_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Accès refusé")
    
    update_data = {}
    if update.title:
        update_data["title"] = update.title
    if update.content is not None:
        update_data["content"] = update.content
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.documents.update_one({"id": document_id}, {"$set": update_data})
    return {"message": "Document mis à jour"}

@documents_module_router.delete("/{document_id}")
async def delete_existing_document(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a document"""
    document = await db.documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document non trouvé")
    
    # Check permissions
    if current_user["role"] not in ["super_admin", "admin"]:
        if document["author_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Accès refusé")
    
    await db.documents.delete_one({"id": document_id})
    return {"message": "Document supprimé"}

@documents_module_router.post("/forms/upload")
async def upload_form_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a .docx document and convert it to editable HTML form"""
    
    # Check file extension
    if not file.filename.endswith('.docx'):
        raise HTTPException(
            status_code=400,
            detail="Seuls les fichiers .docx sont supportés pour le moment"
        )
    
    try:
        # Read file content
        content = await file.read()
        
        # Convert .docx to HTML using mammoth
        result = mammoth.convert_to_html(io.BytesIO(content))
        html_content = result.value
        
        # Post-process: Mark editable fields automatically
        html_with_fields = auto_detect_editable_fields(html_content)
        
        # Create form in database
        form_doc = {
            "id": str(uuid.uuid4()),
            "name": file.filename.replace('.docx', ''),
            "description": f"Importé depuis {file.filename}",
            "category": "other",
            "thumbnail_url": None,
            "content": html_with_fields,
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["id"]
        }
        
        await db.document_forms.insert_one(form_doc)
        form_doc.pop("_id", None)
        
        return {
            "message": "Document converti avec succès",
            "form": form_doc,
            "warnings": result.messages  # Any conversion warnings
        }
    
    except Exception as e:
        logging.error(f"Error converting document: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la conversion: {str(e)}"
        )

def auto_detect_editable_fields(html: str) -> str:
    """
    Automatically detect and mark editable fields in HTML
    Detects:
    - Underscores (_____)
    - Empty table cells
    - Text that looks like placeholders [____] or {____}
    """
    
    # Pattern 1: Replace multiple underscores with editable spans
    # Example: _____ -> <span contenteditable class="editable-field">_____</span>
    html = re.sub(
        r'_{3,}',
        r'<span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100px; display: inline-block;">\g<0></span>',
        html
    )
    
    # Pattern 2: Detect placeholder patterns like [____] or {____}
    html = re.sub(
        r'\[([_\s]{3,})\]',
        r'<span class="editable-field" contenteditable="true" style="border: 1px solid #999; padding: 2px 8px; min-width: 80px; display: inline-block;">[\1]</span>',
        html
    )
    
    # Pattern 3: Make empty table cells editable
    html = re.sub(
        r'<td([^>]*)>\s*</td>',
        r'<td\1 contenteditable="true" class="editable-cell" style="min-height: 30px;"></td>',
        html
    )
    
    return html

@documents_module_router.post("/forms/init-premidis-templates")
async def init_premidis_templates(current_user: dict = Depends(require_roles(["admin"]))):
    """Initialize PREMIDIS official document templates"""
    
    # Delete existing templates to refresh
    await db.document_forms.delete_many({"is_system": True})
    
    # Style pour les checkboxes cliquables
    checkbox_style = '''
<style>
    .checkbox-container {
        display: inline-flex;
        align-items: center;
        margin: 5px 15px 5px 0;
        cursor: pointer;
        user-select: none;
    }
    .checkbox-container input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin-right: 8px;
        cursor: pointer;
        accent-color: #3b82f6;
    }
    .checkbox-container label {
        cursor: pointer;
        font-size: 14px;
    }
    .page-border {
        border: 3px solid #3b82f6;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
</style>
'''
    
    premidis_header = '''
<div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">PREMIDIS SARL</h1>
    <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">COMMUNE DE KARISIMBI, GOMA, DR CONGO</p>
    <p style="color: #cbd5e1; margin: 3px 0 0 0; font-size: 11px;">Route Aéroport N. 20, Q.BUJOVU, C/ de KARISIMBI, Ville de GOMA, Prov. du Nord-Kivu en R.D.Congo</p>
    <p style="color: #cbd5e1; margin: 3px 0 0 0; font-size: 11px;">N R C C M du siège : CD/GOM/RCCM/14-B-0203</p>
</div>
'''
    
    premidis_footer = '''
<div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #3b82f6; font-size: 11px; color: #64748b;">
    <p><strong>Téléphones :</strong> Tel : +243 99 99 95 240, +243 99 76 01 556</p>
    <p><strong>E-mail :</strong> secretary@premidis.com</p>
    <p><strong>Siège Social :</strong> N° 20, Avenue Nyakagozi, Q. Bujovu/ Goma/RDC</p>
    <p><strong>NIF :</strong> A 0700453B | <strong>Id. Nat. :</strong> 5-9-N42250C</p>
</div>
'''
    
    system_forms = [
        # 1. Loan Application Form
        {
            "id": str(uuid.uuid4()),
            "name": "📋 Loan Application Form",
            "description": "Formulaire de demande de crédit employé",
            "category": "loan",
            "thumbnail_url": None,
            "content": f'''{checkbox_style}
<div class="page-border">
{premidis_header}
<div style="padding: 30px;">
    <div style="text-align: right; margin-bottom: 20px;">
        <p><strong>Date:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_____________</span></p>
    </div>
    
    <h2 style="text-align: center; color: #1e3a8a; padding: 15px; background: #f1f5f9; border-left: 4px solid #3b82f6;">Loan Application Form</h2>
    
    <div style="margin: 20px 0;">
        <p><strong>Name of the Employee:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span></p>
        <p><strong>Department & Designation:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span></p>
        <p><strong>ID No:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
        <p><strong>Date Of Joining:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
        <p><strong>Salary Per Month:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
    </div>
    
    <div style="margin: 20px 0;">
        <p><strong>Loan/Advance Amount:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
        <p><strong>Reason:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 500px; display: inline-block;">_____________________</span></p>
        <p><strong>Deduction Per Month:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
    </div>
    
    <div style="margin: 20px 0;">
        <p><strong>Loan Start And Ending Period:</strong></p>
        <p style="margin-left: 20px;"><strong>Start of the Month:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">___________</span> &nbsp;&nbsp; <strong>End of the Month Loan:</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">___________</span></p>
    </div>
    
    <div style="margin: 30px 0;">
        <h3 style="color: #1e3a8a;">Remarks</h3>
        <p><strong>Head of the Department/ HR Department:</strong></p>
        <p><span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100%; display: inline-block; min-height: 60px;">_____________________</span></p>
        
        <p><strong>Of Dues & Remarks by Accounts Department:</strong></p>
        <p><span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100%; display: inline-block; min-height: 60px;">_____________________</span></p>
    </div>
    
    <div style="margin-top: 40px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div style="border: 1px solid #cbd5e1; padding: 15px; text-align: center;">
            <p style="font-weight: bold;">Recommended By</p>
            <p style="margin-top: 50px; border-top: 1px solid #000;">Signature</p>
        </div>
        <div style="border: 1px solid #cbd5e1; padding: 15px; text-align: center;">
            <p style="font-weight: bold;">Loan deduction incharge By</p>
            <p style="margin-top: 50px; border-top: 1px solid #000;">Signature</p>
        </div>
        <div style="border: 1px solid #cbd5e1; padding: 15px; text-align: center;">
            <p style="font-weight: bold;">Authorization By</p>
            <p style="margin-top: 50px; border-top: 1px solid #000;">Signature</p>
        </div>
    </div>
</div>
{premidis_footer}
</div>
''',
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        
        # 2. Bon de Soins Médicaux
        {
            "id": str(uuid.uuid4()),
            "name": "🏥 Bon de Soins Médicaux",
            "description": "Autorisation de soins médicaux",
            "category": "medical",
            "thumbnail_url": None,
            "content": f'''{checkbox_style}
<div class="page-border">
{premidis_header}
<div style="padding: 30px;">
    <h2 style="text-align: center; color: #1e3a8a; padding: 15px; background: #f1f5f9; border-left: 4px solid #3b82f6; text-decoration: underline;">BON DE SOINS MEDICAUX N° <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_____________</span></h2>
    
    <div style="margin: 30px 0;">
        <p><strong>Nom de l'Employé(e) :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span></p>
        <p><strong>Fonction :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span></p>
        <p><strong>Nom du patient :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span></p>
        <p><strong>Age :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100px; display: inline-block;">_____</span> ans &nbsp;&nbsp; <strong>Sexe :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 50px; display: inline-block;">___</span></p>
    </div>
    
    <div style="margin: 30px 0;">
        <p style="font-weight: bold; margin-bottom: 15px;">Relation avec l'employé(e) :</p>
        <div style="margin-left: 30px;">
            <label class="checkbox-container">
                <input type="checkbox" name="relation" value="employe">
                <span>Employé(e)</span>
            </label><br>
            <label class="checkbox-container">
                <input type="checkbox" name="relation" value="epoux">
                <span>Epoux (se)</span>
            </label><br>
            <label class="checkbox-container">
                <input type="checkbox" name="relation" value="enfant">
                <span>Enfant</span>
            </label>
        </div>
    </div>
    
    <div style="margin: 40px 0;">
        <p><strong>Date : Le</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_____________</span></p>
    </div>
    
    <div style="margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
        <div>
            <p style="font-weight: bold;">Pour la DIRECTION</p>
            <div style="margin-top: 80px; border-top: 1px solid #000; padding-top: 5px; text-align: center;">
                <p>BAGISHE BUHENDWA Osee</p>
                <p style="font-size: 11px;">Admin/DRH</p>
            </div>
        </div>
        <div style="text-align: center;">
            <p style="font-weight: bold;">Cachet de la Société</p>
            <div style="margin-top: 60px; width: 150px; height: 150px; border: 2px dashed #3b82f6; border-radius: 50%; margin: 20px auto;"></div>
        </div>
    </div>
</div>
{premidis_footer}
</div>
''',
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        
        # 3. Communication d'Absences
        {
            "id": str(uuid.uuid4()),
            "name": "📅 Communication d'Absences",
            "description": "Justification/Autorisation de congé",
            "category": "leave",
            "thumbnail_url": None,
            "content": f'''{checkbox_style}
<div class="page-border">
{premidis_header}
<div style="padding: 30px;">
    <h2 style="text-align: center; color: #1e3a8a; padding: 15px; background: #f1f5f9; border-left: 4px solid #3b82f6;">COMMUNICATION D'ABSENCES ()</h2>
    
    <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px;">
        <p style="font-weight: bold; margin-bottom: 10px;">Localisation :</p>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="goma">
            <span>Goma</span>
        </label>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="kiwanja">
            <span>Kiwanja</span>
        </label>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="lubumbashi">
            <span>Lubumbashi</span>
        </label>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="kin">
            <span>Kin</span>
        </label>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="kisangani">
            <span>Kisangani</span>
        </label>
        <label class="checkbox-container">
            <input type="checkbox" name="location" value="tshopo">
            <span>Tshopo</span>
        </label>
    </div>
    
    <div style="margin: 30px 0;">
        <p><strong>NOM ET PRENOM :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span> <strong>DEPARTEMENT :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 200px; display: inline-block;">_______________</span></p>
        <p><strong>FONCTION :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 400px; display: inline-block;">_____________________</span> <strong>INTERIM :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100px; display: inline-block;">_______</span></p>
    </div>
    
    <div style="margin: 30px 0; background: #f8fafc; padding: 20px; border-left: 4px solid #3b82f6;">
        <p><strong>PREMIER JOUR D'ABSENCE :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_______________</span></p>
        <p><strong>DERNIER JOUR D'ABSENCE :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_______________</span></p>
        <p><strong>JOUR DE RETOUR AU TRAVAIL :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_______________</span></p>
        <p><strong>Nombre des jours total :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 100px; display: inline-block;">_______</span> Jours &nbsp;&nbsp; <strong>contrôle :</strong> ......Reste : OK</p>
    </div>
    
    <div style="margin: 30px 0; padding: 20px; background: #fef9f5; border-left: 4px solid #f59e0b; border-radius: 8px;">
        <p style="font-weight: bold; font-size: 16px; color: #1e3a8a; margin-bottom: 15px;">Raison d'absence :</p>
        <div style="margin-left: 20px;">
            <label class="checkbox-container">
                <input type="checkbox" name="raison" value="vacances">
                <span><strong>Vacances</strong></span>
            </label><br>
            <label class="checkbox-container">
                <input type="checkbox" name="raison" value="maladie">
                <span><strong>Maladie/accident</strong></span>
            </label><br>
            
            <p style="margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Raison familiale :</p>
            <div style="margin-left: 20px;">
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="mariage_employe">
                    <span>Mariage de l'employé (2 jours)</span>
                </label><br>
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="deces_proche">
                    <span>Décès de l'épouse, du mari, de la mère, du père, d'un enfant (4 jours)</span>
                </label><br>
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="deces_famille">
                    <span>Décès des beaux-parents, d'un frère, d'une sœur, des grands parents (2 jours)</span>
                </label><br>
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="naissance">
                    <span>Naissance d'un enfant (2 jours)</span>
                </label><br>
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="mariage_enfant">
                    <span>Mariage d'un enfant (1 jour)</span>
                </label><br>
                <label class="checkbox-container">
                    <input type="checkbox" name="raison_familiale" value="evenement_grave">
                    <span>Événement involontaire grave (convocation, incendie) (max 2 jours)</span>
                </label><br>
            </div>
            <p style="margin-top: 15px; padding: 10px; background: white; border-left: 3px solid #64748b; font-size: 11px; font-style: italic; color: #64748b;">
            ℹ️ Ces jours de congé doivent être pris consécutivement, au moment de l'événement familial.<br>
            L'employeur n'est tenu d'accorder que jusqu'à concurrence d'un maximum de 15 jours de congé par an pour événement familial.</p>
            
            <label class="checkbox-container" style="margin-top: 15px;">
                <input type="checkbox" name="raison" value="autres">
                <span><strong>AUTRES RAISONS - EXPLICATION NECESSAIRE</strong></span>
            </label>
        </div>
    </div>
    
    <div style="margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
        <div>
            <p><strong>DATE :</strong> <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">_______________</span></p>
            <p style="margin-top: 40px;"><strong>SIGNATURE DE L'EMPLOYE :</strong></p>
            <div style="margin-top: 60px; border-top: 1px solid #000;"></div>
        </div>
        <div>
            <p style="font-weight: bold;">POUR L'ADMINISTRATION</p>
            <div style="margin-top: 80px; border-top: 1px solid #000; padding-top: 5px; text-align: center;">
                <p>OSEE BAGISHE BUHENDWA</p>
                <p style="font-size: 11px;">Admin. Sec. And Human Resource Manager</p>
            </div>
        </div>
    </div>
</div>
{premidis_footer}
</div>
''',
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        
        # 4. Lettre de Demande d'Explication (TEXTE FIXE)
        {
            "id": str(uuid.uuid4()),
            "name": "⚠️ Lettre de Demande d'Explication",
            "description": "Lettre disciplinaire (seuls Nom et Date éditables)",
            "category": "disciplinary",
            "thumbnail_url": None,
            "content": f'''{checkbox_style}
<div class="page-border">
{premidis_header}
<div style="padding: 30px;">
    <div style="text-align: right; margin-bottom: 20px;">
        <p>Goma, le <span class="editable-field" contenteditable="true" style="border-bottom: 1px solid #000; min-width: 150px; display: inline-block;">06 Juin 2024</span></p>
    </div>
    
    <p style="margin: 20px 0;"><strong>Réf : N° 063/PMD/DRG/2024</strong></p>
    
    <p style="margin: 20px 0;"><strong>Objet : Demande d'explication</strong></p>
    
    <div style="margin: 30px 0; padding: 20px; background: #fef2f2; border-left: 4px solid #ef4444;">
        <p><strong>A Monsieur <span class="editable-field" contenteditable="true" style="border-bottom: 2px solid #ef4444; min-width: 200px; display: inline-block; background: #fff;">JOHN MIHIGO</span></strong></p>
        <p><strong>Agent de la société PREMIDIS</strong></p>
        <p><strong>à Goma.</strong></p>
    </div>
    
    <p style="margin: 30px 0;"><strong>Monsieur,</strong></p>
    
    <p style="margin: 20px 0; line-height: 1.8; text-align: justify;">
    Voudriez-vous nous fournir des explications dans les 24 heures qui suivent la signature de celle-ci ; concernant l'érection d'une clôture dans la parcelle de la Société précisément au bloc que la Société préconise vous octroyer et encore que, en procédure de cession n'est pas encore achevée ?
    </p>
    
    <p style="margin: 20px 0; line-height: 1.8; text-align: justify;">
    Etant donné que vous n'avez aucun soubassement vous liant à cette parcelle mais aussi que ce dossier vient de causer la révocation sans préavis de notre gérant de la concession, nous vous octroyons le délai ci-haut évoqué pour nous apporter éclaircissements mais aussi l'initiateur de ces actions car les noms à notre possession du potentiel auteur ne renseignent personne.
    </p>
    
    <p style="margin: 40px 0;">Recevez nos salutations considérées.</p>
    
    <div style="margin-top: 60px;">
        <p style="font-weight: bold;">Pour la société PREMIDIS</p>
        <div style="margin-top: 80px; width: 200px;">
            <div style="border-top: 1px solid #000; padding-top: 5px;">
                <p>BAGISHE BUHENDWA Osee</p>
                <p style="font-size: 11px;">DRH</p>
            </div>
        </div>
    </div>
</div>
{premidis_footer}
</div>
''',
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        
        # 5. Page Vierge Officielle PREMIDIS
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Page Vierge Officielle PREMIDIS",
            "description": "Page pré-formatée avec design PREMIDIS pour rédaction libre",
            "category": "blank",
            "thumbnail_url": None,
            "content": f'''{checkbox_style}
<div class="page-border">
{premidis_header}
<div style="padding: 30px; min-height: 500px;">
    <div contenteditable="true" style="min-height: 400px; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #fafafa;">
        <p style="color: #94a3b8; font-style: italic;">Cliquez ici pour commencer à rédiger votre document...</p>
    </div>
</div>
{premidis_footer}
</div>
''',
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        }
    ]
    
    await db.document_forms.insert_many(system_forms)
    return {"message": "Templates PREMIDIS créés avec succès", "count": len(system_forms)}

@documents_module_router.post("/forms/init-system-forms")
async def init_system_forms(current_user: dict = Depends(require_roles(["admin"]))):
    """Initialize system forms (run once)"""
    existing = await db.document_forms.count_documents({"is_system": True})
    if existing > 0:
        return {"message": "Formes système déjà initialisées", "count": existing}
    
    system_forms = [
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Papier Vierge",
            "description": "Document vierge pour commencer",
            "category": "blank",
            "thumbnail_url": None,
            "content": "<p><br></p>",
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Demande de Congé",
            "description": "Modèle pour demandes de congé",
            "category": "leave",
            "thumbnail_url": None,
            "content": """
<h1>Demande de Congé</h1>
<p><br></p>
<p><strong>Nom:</strong> _____________</p>
<p><strong>Département:</strong> _____________</p>
<p><strong>Date de début:</strong> _____________</p>
<p><strong>Date de fin:</strong> _____________</p>
<p><strong>Type de congé:</strong> _____________</p>
<p><strong>Motif:</strong></p>
<p>_____________________________________________</p>
<p><br></p>
<p>Date: _____________ &nbsp;&nbsp;&nbsp; Signature: _____________</p>
            """,
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Lettre Officielle",
            "description": "Modèle de lettre formelle",
            "category": "letter",
            "thumbnail_url": None,
            "content": """
<p style="text-align: right;">Le _____________ </p>
<p><br></p>
<p><strong>Destinataire</strong></p>
<p>_____________</p>
<p>_____________</p>
<p><br></p>
<p><strong>Objet:</strong> _____________</p>
<p><br></p>
<p>Madame, Monsieur,</p>
<p><br></p>
<p>_____________________________________________</p>
<p>_____________________________________________</p>
<p><br></p>
<p>Cordialement,</p>
<p><br></p>
<p>_____________</p>
            """,
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Rapport Mensuel",
            "description": "Template pour rapports mensuels",
            "category": "report",
            "thumbnail_url": None,
            "content": """
<h1 style="text-align: center;">RAPPORT MENSUEL</h1>
<p style="text-align: center;">Mois: _____________ Année: _____________</p>
<p><br></p>
<h2>1. Résumé Exécutif</h2>
<p>_____________________________________________</p>
<p><br></p>
<h2>2. Activités Réalisées</h2>
<p>_____________________________________________</p>
<p><br></p>
<h2>3. Résultats</h2>
<p>_____________________________________________</p>
<p><br></p>
<h2>4. Défis Rencontrés</h2>
<p>_____________________________________________</p>
<p><br></p>
<h2>5. Plan d'Action</h2>
<p>_____________________________________________</p>
            """,
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        },
        {
            "id": str(uuid.uuid4()),
            "name": "📄 Facture",
            "description": "Modèle de facture",
            "category": "invoice",
            "thumbnail_url": None,
            "content": """
<h1>FACTURE</h1>
<p><br></p>
<table style="width: 100%;">
  <tr>
    <td><strong>De:</strong><br>Entreprise<br>Adresse<br>Contact</td>
    <td style="text-align: right;"><strong>Facture N°:</strong> _______<br><strong>Date:</strong> _______</td>
  </tr>
</table>
<p><br></p>
<p><strong>À:</strong></p>
<p>Client</p>
<p>Adresse</p>
<p><br></p>
<table style="width: 100%; border-collapse: collapse;">
  <tr style="background-color: #f0f0f0;">
    <th style="border: 1px solid #ddd; padding: 8px;">Description</th>
    <th style="border: 1px solid #ddd; padding: 8px;">Quantité</th>
    <th style="border: 1px solid #ddd; padding: 8px;">Prix Unitaire</th>
    <th style="border: 1px solid #ddd; padding: 8px;">Total</th>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 8px;">_______</td>
    <td style="border: 1px solid #ddd; padding: 8px;">_______</td>
    <td style="border: 1px solid #ddd; padding: 8px;">_______</td>
    <td style="border: 1px solid #ddd; padding: 8px;">_______</td>
  </tr>
</table>
<p><br></p>
<p style="text-align: right;"><strong>TOTAL: _______</strong></p>
            """,
            "is_system": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "system"
        }
    ]
    
    await db.document_forms.insert_many(system_forms)
    return {"message": "Formes système créées avec succès", "count": len(system_forms)}

api_router.include_router(documents_module_router)

app.include_router(api_router)

# Mount uploads folder - use /api/uploads for Kubernetes ingress routing
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.leaves.create_index("employee_id")
    await db.leaves.create_index("status")
    await db.calendar.create_index("start_date")
    
    # Initialize default leave rules
    existing_rules = await db.leave_rules.find_one({"type": "default"})
    if not existing_rules:
        default_rules = LeaveRuleConfig().model_dump()
        default_rules["type"] = "default"
        await db.leave_rules.insert_one(default_rules)
    
    logger.info("PREMIDIS SARL HR Platform started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
