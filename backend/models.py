from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date

class MerchantIndustry(BaseModel):
    industry_code: str
    industry_name: str
    priority: int

class IndustryInfo(BaseModel):
    industry_code: str
    industry_name: str

class MerchantBase(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    zip_code: Optional[str] = None
    tax_id: Optional[str] = None
    website: Optional[str] = None

class MerchantListItem(MerchantBase):
    lat: Optional[float] = None
    lon: Optional[float] = None
    distance_km: Optional[float] = None

class MerchantDetail(MerchantListItem):
    industries: List[MerchantIndustry] = []

class PaginatedMerchants(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    items: List[MerchantListItem]

class CityStat(BaseModel):
    city: str
    count: int

class Stats(BaseModel):
    total_merchants: int
    has_website: int
    cities: List[CityStat]

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class ExpenseCreate(BaseModel):
    merchant_id: Optional[int] = None
    merchant_name: str
    amount: int = Field(..., gt=0)
    category: str = Field(..., pattern="^(觀光旅遊|自行運用)$")
    expense_date: date
    note: Optional[str] = None

class ExpenseResponse(BaseModel):
    id: int
    user_id: int
    merchant_id: Optional[int] = None
    merchant_name: str
    amount: int
    category: str
    expense_date: str
    note: Optional[str] = None
    created_at: str

class QuotaDetail(BaseModel):
    target: int = 8000
    spent: int
    remaining: int
    percentage: float

class AssistantSummary(BaseModel):
    tourist_quota: QuotaDetail
    general_quota: QuotaDetail
    total_spent: int
    favorites_count: int


class ItineraryItemCreate(BaseModel):
    merchant_id: Optional[int] = None
    custom_name: str
    address: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    order_index: int = 0
    estimated_cost: float = Field(default=0.0, ge=0)
    quota_category: str = Field(default="一般消費", pattern="^(觀光旅遊|自行運用|一般消費)$")
    stay_minutes: int = Field(default=60, ge=0)

class ItineraryItemResponse(ItineraryItemCreate):
    id: int
    itinerary_id: int

class ItineraryCreate(BaseModel):
    title: str
    start_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[ItineraryItemCreate] = []

class ItineraryUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[ItineraryItemCreate]] = None

class ItineraryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    start_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    items: List[ItineraryItemResponse] = []
    total_tourist_quota: float = 0.0
    total_general_quota: float = 0.0


