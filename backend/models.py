from pydantic import BaseModel, Field
from typing import Optional, List

class MerchantIndustry(BaseModel):
    industry_code: str
    industry_name: str
    priority: int

class IndustryInfo(BaseModel):
    industry_code: str
    industry_name: str
    industry_group_code: str
    industry_group_name: str
    industry_group_order: int

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
    coord_source: Optional[str] = None
    coord_accuracy: Optional[str] = None
    geocoded_address: Optional[str] = None

class MerchantDetail(MerchantListItem):
    industries: List[MerchantIndustry] = Field(default_factory=list)

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
    last_updated: Optional[str] = None
    last_checked: Optional[str] = None
    last_check_result: Optional[str] = None
    last_successful_check: Optional[str] = None
