from pydantic import BaseModel
from typing import Optional, List

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
