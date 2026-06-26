from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from lxml import etree
from datetime import datetime, timedelta
import re

app = FastAPI(title="teif-api")


# =========================
# MODELS
# =========================

class GenerateRequest(BaseModel):
    data: Any


# =========================
# HELPERS
# =========================

def text(value, default=""):
    if value is None:
        return default
    return str(value).strip()


def clean_multiline(value):
    return re.sub(r"\s+", " ", text(value)).strip()


def amount(value):
    try:
        return f"{float(value):.2f}"
    except Exception:
        return "0.00"


def number_text(value):
    try:
        n = float(value)
        if n.is_integer():
            return str(int(n))
        return str(n)
    except Exception:
        return text(value)


def first_item(payload):
    """
    Accepts:
    - direct object
    - list with one invoice object
    - {"data": object}
    - {"data": [object]}
    """
    if isinstance(payload, dict) and "data" in payload:
        payload = payload["data"]

    if isinstance(payload, list):
        if not payload:
            raise HTTPException(status_code=400, detail="Empty invoice list")
        return payload[0]

    if isinstance(payload, dict):
        return payload

    raise HTTPException(status_code=400, detail="Invalid input format")


def parse_date(value):
    """
    Converts dates to TEIF ddMMyy format.
    Supports:
    - 29/06/2026
    - 2026-06-29
    - 290626
    """
    value = clean_multiline(value)

    if not value:
        return ""

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%d%m%y")
        except Exception:
            pass

    if re.fullmatch(r"\d{6}", value):
        return value

    return ""


def add_days_ddmmyy(ddmmyy, days=30):
    if not ddmmyy:
        return ""
    try:
        d = datetime.strptime(ddmmyy, "%d%m%y")
        return (d + timedelta(days=days)).strftime("%d%m%y")
    except Exception:
        return ""


def extract_invoice_number(value):
    """
    Fixes bad OCR/extraction like:
    '29/06/2026\\n10001293' -> '10001293'
    """
    value = clean_multiline(value)

    if not value:
        return ""

    value = re.sub(r"\d{2}/\d{2}/\d{4}", " ", value)
    nums = re.findall(r"\d{5,}", value)

    if nums:
        return nums[-1]

    return value


def get_party(data, key1, key2=None):
    if key1 in data and isinstance(data[key1], dict):
        return data[key1]
    if key2 and key2 in data and isinstance(data[key2], dict):
        return data[key2]
    return {}


def get_currency(data):
    invoice = data.get("invoice", {})
    return text(invoice.get("currency"), "TND") or "TND"


def sub(parent, tag, value=None, **attrs):
    el = etree.SubElement(parent, tag, **{k: str(v) for k, v in attrs.items() if v is not None})
    if value is not None:
        el.text = str(value)
    return el


def add_amount(parent, amount_type_code, value, currency):
    amount_details = sub(parent, "AmountDetails")
    moa = sub(
        amount_details,
        "Moa",
        amountTypeCode=amount_type_code,
        currencyCodeList="ISO_4217"
    )
    sub(moa, "Amount", amount(value), currencyIdentifier=currency)


def add_line_amount(parent, amount_type_code, value, currency):
    moa_details = sub(parent, "MoaDetails")
    moa = sub(
        moa_details,
        "Moa",
        amountTypeCode=amount_type_code,
        currencyCodeList="ISO_4217"
    )
    sub(moa, "Amount", amount(value), currencyIdentifier=currency)


def partner_identifier_type(country):
    country = text(country).upper()
    if country == "TN":
        return "I-01"
    return "I-04"


# =========================
# TEIF GENERATOR
# =========================

def build_teif(data: Dict[str, Any]) -> str:
    supplier = get_party(data, "supplier")
    client = get_party(data, "client", "customer")
    invoice = data.get("invoice", {})
    totals = data.get("totals", {})
    lines = data.get("lines", [])

    currency = get_currency(data)

    invoice_number = extract_invoice_number(
        invoice.get("invoice_number") or invoice.get("number") or invoice.get("id")
    )

    issue_date = parse_date(
        invoice.get("issue_date") or invoice.get("date")
    )

    due_date = parse_date(
        invoice.get("due_date") or invoice.get("payment_due_date")
    )

    if issue_date and not due_date:
        due_date = add_days_ddmmyy(issue_date, 30)

    supplier_country = text(supplier.get("country"), "FR")
    client_country = text(client.get("country"), "FR")

    supplier_id = text(
        supplier.get("vat_number")
        or supplier.get("tax_id")
        or supplier.get("siret")
        or supplier.get("identifier")
    )

    client_id = text(
        client.get("code")
        or client.get("vat_number")
        or client.get("tax_id")
        or client.get("identifier")
    )

    root = etree.Element("TEIF", controlingAgency="TTN", version="1.8.8")

    # =========================
    # HEADER
    # =========================

    header = sub(root, "InvoiceHeader")
    sub(
        header,
        "MessageSenderIdentifier",
        supplier_id,
        type=partner_identifier_type(supplier_country)
    )
    sub(
        header,
        "MessageRecieverIdentifier",
        client_id,
        type=partner_identifier_type(client_country)
    )

    body = sub(root, "InvoiceBody")

    # =========================
    # BGM
    # =========================

    bgm = sub(body, "Bgm")
    sub(bgm, "DocumentIdentifier", invoice_number)
    doc_type = sub(bgm, "DocumentType", "Facture", code="I-11")

    # =========================
    # DATES
    # =========================

    dtm = sub(body, "Dtm")
    sub(dtm, "DateText", issue_date, format="ddMMyy", functionCode="I-31")

    if due_date:
        sub(dtm, "DateText", due_date, format="ddMMyy", functionCode="I-32")

    if issue_date and due_date:
        sub(
            dtm,
            "DateText",
            f"{issue_date}-{due_date}",
            format="ddMMyy-ddMMyy",
            functionCode="I-36"
        )

    # =========================
    # PARTNERS
    # =========================

    partner_section = sub(body, "PartnerSection")

    # Supplier I-63
    supplier_details = sub(partner_section, "PartnerDetails", functionCode="I-63")
    nad = sub(supplier_details, "Nad")
    sub(nad, "PartnerIdentifier", supplier_id, type=partner_identifier_type(supplier_country))
    sub(nad, "PartnerName", clean_multiline(supplier.get("name")), nameType="Qualification")

    supplier_address = clean_multiline(
        supplier.get("full_address")
        or supplier.get("address")
        or ""
    )

    addr = sub(nad, "PartnerAdresses", lang="fr")
    sub(addr, "AdressDescription", supplier_address)
    sub(addr, "Country", supplier_country, codeList="ISO_3166-1")

    rff = sub(supplier_details, "RffSection")
    sub(rff, "Reference", supplier_id, refID="I-815")

    rff = sub(supplier_details, "RffSection")
    sub(rff, "Reference", "SA", refID="I-816")

    if invoice_number:
        rff = sub(supplier_details, "RffSection")
        sub(rff, "Reference", invoice_number, refID="I-817")

    phone = clean_multiline(supplier.get("phone"))
    email = clean_multiline(supplier.get("email"))
    website = clean_multiline(supplier.get("website"))
    fax = clean_multiline(supplier.get("fax"))

    if phone or fax or email or website:
        cta = sub(supplier_details, "CtaSection")
        contact = sub(cta, "Contact", functionCode="I-94")

        if phone:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-101")
            sub(com, "ComMeansValue", phone)

        if fax:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-102")
            sub(com, "ComMeansValue", fax)

        if email:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-103")
            sub(com, "ComMeansValue", email)

        if website:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-104")
            sub(com, "ComMeansValue", website)

    # Client I-64
    client_details = sub(partner_section, "PartnerDetails", functionCode="I-64")
    nad = sub(client_details, "Nad")
    sub(nad, "PartnerIdentifier", client_id, type=partner_identifier_type(client_country))
    sub(nad, "PartnerName", clean_multiline(client.get("name")), nameType="Qualification")

    client_address = clean_multiline(
        client.get("full_address")
        or client.get("address")
        or ""
    )

    addr = sub(nad, "PartnerAdresses", lang="fr")
    sub(addr, "AdressDescription", client_address)
    sub(addr, "Country", client_country, codeList="ISO_3166-1")

    rff = sub(client_details, "RffSection")
    sub(rff, "Reference", client_id, refID="I-81")

    # =========================
    # PAYMENT
    # =========================

    pyt_section = sub(body, "PytSection")
    details = sub(pyt_section, "PytSectionDetails")
    pyt = sub(details, "Pyt")
    sub(pyt, "PaymentTearmsTypeCode", "I-114")
    sub(pyt, "PaymentTearmsDescription", "Virement à 30 jours net")

    # =========================
    # LINES
    # =========================

    lin_section = sub(body, "LinSection")

    for index, line in enumerate(lines, start=1):
        lin = sub(lin_section, "Lin")
        sub(lin, "ItemIdentifier", index)

        imd = sub(lin, "LinImd", lang="fr")
        sub(imd, "ItemCode", clean_multiline(line.get("reference")))
        sub(imd, "ItemDescription", clean_multiline(line.get("designation")))

        qty = sub(lin, "LinQty")
        sub(qty, "Quantity", number_text(line.get("quantity", 1)), measurementUnit="UNIT")

        discount = float(line.get("discount") or 0)
        if discount > 0:
            alc = sub(lin, "LinAlc")
            alc_node = sub(alc, "Alc", allowanceOrChargeCode="I-151")
            sub(alc_node, "AlcRate", amount(discount))

        tax = sub(lin, "LinTax")
        sub(tax, "TaxTypeName", "TVA", code="I-1602")
        tax_details = sub(tax, "TaxDetails")
        sub(tax_details, "TaxRate", number_text(line.get("tax_rate", 0)))

        lin_moa = sub(lin, "LinMoa")
        add_line_amount(lin_moa, "I-183", line.get("unit_price", 0), currency)
        add_line_amount(lin_moa, "I-171", line.get("line_total_ht", 0), currency)

    # =========================
    # GLOBAL AMOUNTS
    # =========================

    total_ht = totals.get("total_ht", 0)
    total_tva = totals.get("total_tva", totals.get("vat_amount", 0))
    total_ttc = totals.get("total_ttc", 0)

    invoice_moa = sub(body, "InvoiceMoa")
    add_amount(invoice_moa, "I-176", total_ht, currency)
    add_amount(invoice_moa, "I-182", total_ht, currency)
    add_amount(invoice_moa, "I-181", total_tva, currency)
    add_amount(invoice_moa, "I-180", total_ttc, currency)

    # =========================
    # TAX
    # =========================

    invoice_tax = sub(body, "InvoiceTax")

    tax_details = sub(invoice_tax, "InvoiceTaxDetails")
    tax = sub(tax_details, "Tax")
    sub(tax, "TaxTypeName", "TVA", code="I-1602")
    td = sub(tax, "TaxDetails")
    sub(td, "TaxRate", "20")
    ad = sub(tax, "AmountDetails")
    moa = sub(ad, "Moa", amountTypeCode="I-178", currencyCodeList="ISO_4217")
    sub(moa, "Amount", amount(total_tva), currencyIdentifier=currency)

    stamp_details = sub(invoice_tax, "InvoiceTaxDetails")
    stamp = sub(stamp_details, "Tax")
    sub(stamp, "TaxTypeName", "droit de timbre", code="I-1601")
    td = sub(stamp, "TaxDetails")
    sub(td, "TaxRate", "0")
    ad = sub(stamp, "AmountDetails")
    moa = sub(ad, "Moa", amountTypeCode="I-178", currencyCodeList="ISO_4217")
    sub(moa, "Amount", "0.00", currencyIdentifier=currency)

    xml_bytes = etree.tostring(
        root,
        pretty_print=True,
        xml_declaration=True,
        encoding="utf-8"
    )

    return xml_bytes.decode("utf-8")


# =========================
# ENDPOINTS
# =========================

@app.post("/generate")
def generate(payload: Any = Body(...)):
    try:
        invoice_data = first_item(payload)
        xml_content = build_teif(invoice_data)

        return [
            {
                "xml_content": xml_content
            }
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}