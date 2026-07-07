from flask import Flask, request, jsonify
from lxml import etree
import os
import re
from calendar import monthrange
from datetime import datetime

app = Flask(__name__)

PORT = int(os.environ.get("PORT", 5000))
TEIF_VERSION = os.environ.get("TEIF_VERSION", "3.0")


# ============================================================
# UTILS
# ============================================================

def fix_mojibake(s):
    if s is None:
        return ""
    s = str(s)
    try:
        return s.encode("latin-1").decode("utf-8")
    except Exception:
        return s


def esc(s):
    if s is None:
        return ""
    return fix_mojibake(str(s).strip())


def parse_amount(value):
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip()
    s = s.replace("TND", "")
    s = s.replace("EUR", "")
    s = s.replace("USD", "")
    s = s.replace("%", "")
    s = s.replace("\u00a0", "")
    s = s.replace(" ", "")
    s = s.replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)

    try:
        return float(s)
    except Exception:
        return 0.0


def fmt(value, decimals=3):
    try:
        return f"{float(value or 0):.{decimals}f}"
    except Exception:
        return f"{0:.{decimals}f}"


def to_teif_date(d):
    if not d:
        return ""

    d = str(d).strip()

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", d)
    if m:
        yyyy, mm, dd = m.group(1), m.group(2), m.group(3)
        return f"{dd}{mm}{yyyy[-2:]}"

    m = re.match(r"^(\d{2})[/\-\.](\d{2})[/\-\.](\d{2,4})$", d)
    if m:
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        return f"{dd}{mm}{yyyy[-2:]}"

    return d


def build_period_from_invoice_date(teif_date):
    if not teif_date or len(teif_date) != 6:
        return ""

    try:
        mm = teif_date[2:4]
        yy = teif_date[4:6]
        year = 2000 + int(yy)
        last_day = monthrange(year, int(mm))[1]
        return f"01{mm}{yy}-{last_day:02d}{mm}{yy}"
    except Exception:
        return ""


def sub(parent, tag, text=None, attribs=None):
    el = etree.SubElement(parent, tag)

    if attribs:
        for k, v in attribs.items():
            if v is not None:
                el.set(k, str(v))

    if text is not None:
        el.text = str(text)

    return el


# ============================================================
# IDENTIFIANTS
# ============================================================

def normalize_tunisian_id(raw, default_code_tva="A", default_category="M", default_etab="000"):
    """
    Exemples :
    1338455H           -> 1338455HAM000
    1369372B/B/M/000   -> 1369372BBM000
    1369372BBM000      -> 1369372BBM000
    C0001              -> C0001
    """
    if not raw:
        return ""

    s = str(raw).strip().upper()

    m = re.match(r"^([A-Z0-9]{7,8})[/\-]([A-Z])[/\-]([A-Z])[/\-](\d{3})$", s)
    if m:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}{m.group(4)}"[:13]

    cleaned = re.sub(r"[^A-Z0-9]", "", s)

    if len(cleaned) == 13:
        return cleaned

    if len(cleaned) in (7, 8):
        return f"{cleaned}{default_code_tva}{default_category}{default_etab}"[:13]

    return cleaned


def short_tunisian_id(raw):
    """
    Pour fournisseur :
    1338455HAM000 -> 1338455H
    1338455H      -> 1338455H
    """
    if not raw:
        return ""

    cleaned = re.sub(r"[^A-Z0-9]", "", str(raw).upper())

    if len(cleaned) >= 8:
        return cleaned[:8]

    return cleaned


def normalize_foreign_id(raw):
    if not raw:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(raw).strip().upper())


def detect_country_from_profile(profile, fallback="TN"):
    if not profile:
        return fallback

    p = str(profile).strip().lower()

    if "tun" in p or p == "tn":
        return "TN"

    if "fran" in p or p == "fr":
        return "FR"

    return fallback


def partner_type_by_country(country):
    country = (country or "TN").upper()

    if country == "TN":
        return "I-01"

    return "I-04"


# ============================================================
# NORMALISATION INPUT
# ============================================================

def normalize_input_to_internal(body):
    """
    Accepte :
    1) JSON extraction OCR/PDF
    2) JSON déjà normalisé : header/items/footer
    """

    if isinstance(body, list):
        body = body[0] if body else {}

    if "header" in body and "items" in body:
        return {
            "header": body.get("header", {}) or {},
            "items": body.get("items", []) or [],
            "footer": body.get("footer", {}) or {}
        }

    document = body.get("document", {}) or {}
    fournisseur = body.get("fournisseur", {}) or {}
    client = body.get("client", {}) or {}
    facture = body.get("facture", {}) or {}
    lignes = body.get("lignes_facture", []) or []
    totaux = body.get("totaux", {}) or {}

    currency = document.get("devise") or "TND"

    profil_country = detect_country_from_profile(document.get("profil_pays"), "TN")

    sup_country = (
        fournisseur.get("pays")
        or fournisseur.get("country")
        or profil_country
        or "TN"
    ).upper()

    cus_country = (
        client.get("pays")
        or client.get("country")
        or profil_country
        or "TN"
    ).upper()

    sup_raw_id = (
        fournisseur.get("identifiant")
        or fournisseur.get("matricule_fiscal_ou_tva")
        or fournisseur.get("numero_fournisseur")
        or fournisseur.get("siret")
        or fournisseur.get("siren")
        or fournisseur.get("vat_number")
        or ""
    )

    cus_raw_id = (
        client.get("identifiant")
        or client.get("matricule_fiscal_ou_tva")
        or client.get("siret")
        or client.get("siren")
        or client.get("vat_number")
        or client.get("code_client")
        or ""
    )

    if sup_country == "TN":
        sup_partner_id = normalize_tunisian_id(sup_raw_id)
        sup_rff = short_tunisian_id(sup_raw_id)
    else:
        sup_partner_id = normalize_foreign_id(sup_raw_id)
        sup_rff = sup_partner_id

    if cus_country == "TN":
        cus_partner_id = normalize_tunisian_id(cus_raw_id)
        cus_rff = normalize_tunisian_id(cus_raw_id)
    else:
        cus_partner_id = normalize_foreign_id(cus_raw_id)
        cus_rff = cus_partner_id

    items = []

    for index, line in enumerate(lignes, start=1):
        unit_price = line.get("prix_unitaire_num")
        if unit_price is None:
            unit_price = line.get("prix_unitaire")

        total_ht_line = line.get("montant_ht_num")
        if total_ht_line is None:
            total_ht_line = line.get("montant_ht")

        tva_rate = line.get("taux_tva_num")
        if tva_rate is None:
            tva_rate = line.get("taux_tva")

        remises = line.get("remises", []) or []

        items.append({
            "line": line.get("numero_ligne", index),
            "ref": line.get("reference", ""),
            "description": line.get("designation", ""),
            "qty": parse_amount(line.get("quantite", 1)),
            "unit": line.get("unite", "UNIT") or "UNIT",
            "unit_price": parse_amount(unit_price),
            "remises": remises,
            "tva_rate": parse_amount(tva_rate),
            "total_ht": parse_amount(total_ht_line)
        })

    sum_lines_ht = round(sum(parse_amount(it.get("total_ht")) for it in items), 3)

    total_ht = parse_amount(totaux.get("total_ht") or totaux.get("base_tva"))
    base_tva = parse_amount(totaux.get("base_tva") or total_ht)
    total_tva = parse_amount(totaux.get("montant_tva"))
    total_ttc = parse_amount(totaux.get("total_ttc"))
    droit_timbre = parse_amount(totaux.get("timbre_fiscal"))
    net_a_payer = parse_amount(totaux.get("net_a_payer"))

    if total_ht <= 0 and sum_lines_ht > 0:
        total_ht = sum_lines_ht

    if base_tva <= 0:
        base_tva = total_ht

    if total_tva <= 0 and total_ttc > 0:
        total_tva = round(total_ttc - total_ht, 3)

    if total_ttc <= 0:
        if net_a_payer > 0:
            total_ttc = net_a_payer
        else:
            total_ttc = round(total_ht + total_tva, 3)

    return {
        "header": {
            "invoice_number": facture.get("numero", ""),
            "invoice_date": facture.get("date_facture", ""),
            "due_date": facture.get("date_echeance", ""),
            "period": "",
            "doc_type": document.get("code_type_document", "I-11"),

            "supplier": {
                "id": sup_partner_id,
                "id_type": partner_type_by_country(sup_country),
                "rff": sup_rff,
                "name": fournisseur.get("nom", ""),
                "address": fournisseur.get("adresse", ""),
                "city": fournisseur.get("ville", ""),
                "postal_code": fournisseur.get("code_postal", ""),
                "country": sup_country,
                "phone": fournisseur.get("telephone", ""),
                "email": fournisseur.get("email", ""),
                "website": fournisseur.get("site_web", ""),
                "tva_code": fournisseur.get("code_tva") or "SA"
            },

            "customer": {
                "id": cus_partner_id,
                "id_type": partner_type_by_country(cus_country),
                "rff": cus_rff,
                "code": client.get("code_client", ""),
                "name": client.get("nom", ""),
                "address": client.get("adresse", ""),
                "city": client.get("ville", ""),
                "postal_code": client.get("code_postal", ""),
                "country": cus_country,
                "phone": client.get("telephone", ""),
                "email": client.get("email", ""),
                "website": client.get("site_web", ""),
                "tva_code": client.get("code_tva") or "B"
            }
        },

        "items": items,

        "footer": {
            "currency": currency,
            "total_ht": total_ht,
            "base_tva": base_tva,
            "total_tva": total_tva,
            "total_ttc": total_ttc,
            "droit_timbre": droit_timbre,
            "net_a_payer": net_a_payer,
            "payment_method": facture.get("mode_paiement") or "Chèque",
            "payment_conditions": facture.get("conditions_paiement") or ""
        }
    }


# ============================================================
# XML BUILDERS
# ============================================================

def build_partner(
    partner_section,
    func_code,
    partner_id,
    partner_type,
    partner_name,
    address,
    country,
    city="",
    postal_code="",
    fiscal_ref="",
    tva_code="",
    phone="",
    email="",
    website="",
    ref_id_main="I-815",
    is_customer=False
):
    pd = sub(partner_section, "PartnerDetails", attribs={
        "functionCode": func_code
    })

    nad = sub(pd, "Nad")

    sub(nad, "PartnerIdentifier", esc(partner_id), {
        "type": partner_type
    })

    sub(nad, "PartnerName", esc(partner_name), {
        "nameType": "Qualification"
    })

    addr_el = sub(nad, "PartnerAdresses", attribs={
        "lang": "fr"
    })

    sub(addr_el, "AdressDescription", esc(address))

    if city:
        sub(addr_el, "CityName", esc(city))

    if postal_code:
        sub(addr_el, "PostalCode", esc(postal_code))

    sub(addr_el, "Country", esc(country), {
        "codeList": "ISO_3166-1"
    })

    if fiscal_ref:
        rff = sub(pd, "RffSection")
        sub(rff, "Reference", esc(fiscal_ref), {
            "refID": ref_id_main
        })

    if not is_customer:
        if tva_code:
            rff2 = sub(pd, "RffSection")
            sub(rff2, "Reference", esc(tva_code), {
                "refID": "I-816"
            })
    else:
        if tva_code:
            rff2 = sub(pd, "RffSection")
            sub(rff2, "Reference", esc(tva_code), {
                "refID": "I-812"
            })

    if phone or email or website:
        cta = sub(pd, "CtaSection")
        contact = sub(cta, "Contact", attribs={
            "functionCode": "I-94"
        })

        if phone:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-101")
            sub(com, "ComMeansValue", esc(phone))

        if email:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-103")
            sub(com, "ComMeansValue", esc(email))

        if website:
            com = sub(contact, "ComSection")
            sub(com, "ComMeansType", "I-104")
            sub(com, "ComMeansValue", esc(website))

    return pd


def build_lines(lin_section, items, currency="TND"):
    for index, it in enumerate(items, start=1):
        lin = sub(lin_section, "Lin")

        sub(lin, "ItemIdentifier", str(it.get("line") or index))

        lin_imd = sub(lin, "LinImd", attribs={
            "lang": "fr"
        })

        sub(lin_imd, "ItemCode", esc(it.get("ref", "")))
        sub(lin_imd, "ItemDescription", esc(it.get("description", "")))

        lin_qty = sub(lin, "LinQty")

        qty = parse_amount(it.get("qty", 1))
        qty_text = str(int(qty)) if qty == int(qty) else fmt(qty, 3)

        sub(lin_qty, "Quantity", qty_text, {
            "measurementUnit": it.get("unit", "UNIT") or "UNIT"
        })

        remises = it.get("remises", []) or []

        if not remises:
            remise_single = parse_amount(it.get("remise", 0))
            if remise_single > 0:
                remises = [remise_single]

        for remise in remises:
            remise_value = parse_amount(remise)

            if remise_value > 0:
                lin_alc = sub(lin, "LinAlc")
                alc = sub(lin_alc, "Alc", attribs={
                    "allowanceOrChargeCode": "I-151"
                })
                sub(alc, "AlcRate", str(round(remise_value, 2)))

        lin_tax = sub(lin, "LinTax")
        sub(lin_tax, "TaxTypeName", "TVA", {
            "code": "I-1602"
        })

        tax_details = sub(lin_tax, "TaxDetails")
        tva_rate = parse_amount(it.get("tva_rate", 0))
        tva_text = str(int(tva_rate)) if tva_rate == int(tva_rate) else str(tva_rate)

        sub(tax_details, "TaxRate", tva_text)

        lin_moa = sub(lin, "LinMoa")

        moa_details_1 = sub(lin_moa, "MoaDetails")
        moa_1 = sub(moa_details_1, "Moa", attribs={
            "amountTypeCode": "I-183",
            "currencyCodeList": "ISO_4217"
        })

        sub(moa_1, "Amount", fmt(it.get("unit_price", 0), 4), {
            "currencyIdentifier": currency
        })

        moa_details_2 = sub(lin_moa, "MoaDetails")
        moa_2 = sub(moa_details_2, "Moa", attribs={
            "amountTypeCode": "I-171",
            "currencyCodeList": "ISO_4217"
        })

        sub(moa_2, "Amount", fmt(it.get("total_ht", 0), 3), {
            "currencyIdentifier": currency
        })


def add_invoice_moa(invoice_moa, amount_type_code, amount, currency):
    amount_details = sub(invoice_moa, "AmountDetails")

    moa = sub(amount_details, "Moa", attribs={
        "amountTypeCode": amount_type_code,
        "currencyCodeList": "ISO_4217"
    })

    sub(moa, "Amount", fmt(amount, 3), {
        "currencyIdentifier": currency
    })


# ============================================================
# TEIF GENERATOR
# ============================================================

def build_teif_xml(header, items, footer):
    supplier = header.get("supplier", {}) or {}
    customer = header.get("customer", {}) or {}

    currency = footer.get("currency", "TND") or "TND"

    total_ht = parse_amount(footer.get("total_ht"))
    base_tva = parse_amount(footer.get("base_tva") or total_ht)
    total_tva = parse_amount(footer.get("total_tva"))
    total_ttc = parse_amount(footer.get("total_ttc"))
    droit_timbre = parse_amount(footer.get("droit_timbre"))
    net_a_payer = parse_amount(footer.get("net_a_payer"))

    sum_lines_ht = round(sum(parse_amount(it.get("total_ht")) for it in items), 3)

    if total_ht <= 0 and sum_lines_ht > 0:
        total_ht = sum_lines_ht

    if base_tva <= 0:
        base_tva = total_ht

    if total_tva <= 0 and total_ttc > 0:
        total_tva = round(total_ttc - total_ht, 3)

    if total_tva <= 0:
        total_tva = round(sum(
            parse_amount(it.get("total_ht")) * parse_amount(it.get("tva_rate")) / 100
            for it in items
        ), 3)

    if total_ttc <= 0:
        if net_a_payer > 0:
            total_ttc = net_a_payer
        else:
            total_ttc = round(total_ht + total_tva, 3)

    calculated_total = round(total_ht + total_tva, 3)

    invoice_date_teif = to_teif_date(header.get("invoice_date", ""))
    due_date_teif = to_teif_date(header.get("due_date", "")) or invoice_date_teif
    period = header.get("period") or build_period_from_invoice_date(invoice_date_teif)

    doc_type = header.get("doc_type") or header.get("document_type") or "I-11"

    doc_labels = {
        "I-11": "Facture",
        "I-12": "Avoir",
        "I-13": "Note d'honoraire",
        "I-14": "Décompte",
        "I-15": "Facture Export",
        "I-16": "Bon de commande"
    }

    doc_label = doc_labels.get(doc_type, "Facture")

    root = etree.Element("TEIF", attrib={
        "controlingAgency": "TTN",
        "version": TEIF_VERSION
    })

    invoice_header = sub(root, "InvoiceHeader")

    sub(invoice_header, "MessageSenderIdentifier", esc(supplier.get("id", "")), {
        "type": supplier.get("id_type", "I-01")
    })

    sub(invoice_header, "MessageRecieverIdentifier", esc(customer.get("id", "")), {
        "type": customer.get("id_type", "I-01")
    })

    invoice_body = sub(root, "InvoiceBody")

    bgm = sub(invoice_body, "Bgm")
    sub(bgm, "DocumentIdentifier", esc(header.get("invoice_number", "")))
    sub(bgm, "DocumentType", doc_label, {
        "code": doc_type
    })

    dtm = sub(invoice_body, "Dtm")

    sub(dtm, "DateText", invoice_date_teif, {
        "format": "ddMMyy",
        "functionCode": "I-31"
    })

    if period:
        sub(dtm, "DateText", period, {
            "format": "ddMMyy-ddMMyy",
            "functionCode": "I-36"
        })

    sub(dtm, "DateText", due_date_teif, {
        "format": "ddMMyy",
        "functionCode": "I-32"
    })

    partner_section = sub(invoice_body, "PartnerSection")

    build_partner(
        partner_section=partner_section,
        func_code="I-63",
        partner_id=supplier.get("id", ""),
        partner_type=supplier.get("id_type", "I-01"),
        partner_name=supplier.get("name", ""),
        address=supplier.get("address", ""),
        city=supplier.get("city", ""),
        postal_code=supplier.get("postal_code", ""),
        country=supplier.get("country", "TN"),
        fiscal_ref=supplier.get("rff", ""),
        tva_code=supplier.get("tva_code", "SA"),
        phone=supplier.get("phone", ""),
        email=supplier.get("email", ""),
        website=supplier.get("website", ""),
        ref_id_main="I-815",
        is_customer=False
    )

    build_partner(
        partner_section=partner_section,
        func_code="I-64",
        partner_id=customer.get("id", ""),
        partner_type=customer.get("id_type", "I-01"),
        partner_name=customer.get("name", ""),
        address=customer.get("address", ""),
        city=customer.get("city", ""),
        postal_code=customer.get("postal_code", ""),
        country=customer.get("country", "TN"),
        fiscal_ref=customer.get("rff", ""),
        tva_code=customer.get("tva_code", "B"),
        phone=customer.get("phone", ""),
        email=customer.get("email", ""),
        website=customer.get("website", ""),
        ref_id_main="I-81",
        is_customer=True
    )

    payment_method = footer.get("payment_method") or "Chèque"

    pyt_section = sub(invoice_body, "PytSection")
    pyt_details = sub(pyt_section, "PytSectionDetails")
    pyt = sub(pyt_details, "Pyt")

    sub(pyt, "PaymentTearmsTypeCode", "I-114")
    sub(pyt, "PaymentTearmsDescription", esc(payment_method))

    lin_section = sub(invoice_body, "LinSection")
    build_lines(lin_section, items, currency)

    invoice_moa = sub(invoice_body, "InvoiceMoa")

    add_invoice_moa(invoice_moa, "I-176", total_ht, currency)
    add_invoice_moa(invoice_moa, "I-180", total_ttc, currency)
    add_invoice_moa(invoice_moa, "I-182", base_tva, currency)
    add_invoice_moa(invoice_moa, "I-181", total_tva, currency)

    invoice_tax = sub(invoice_body, "InvoiceTax")
    invoice_tax_details = sub(invoice_tax, "InvoiceTaxDetails")

    tax = sub(invoice_tax_details, "Tax")
    sub(tax, "TaxTypeName", "droit de timbre", {
        "code": "I-1601"
    })

    tax_details = sub(tax, "TaxDetails")
    sub(tax_details, "TaxRate", "0")

    amount_details = sub(invoice_tax_details, "AmountDetails")

    moa_tax = sub(amount_details, "Moa", attribs={
        "amountTypeCode": "I-178",
        "currencyCodeList": "ISO_4217"
    })

    sub(moa_tax, "Amount", fmt(droit_timbre, 3), {
        "currencyIdentifier": currency
    })

    xml_bytes = etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True
    )

    xml_content = xml_bytes.decode("utf-8")

    meta = {
        "invoice_number": header.get("invoice_number", ""),
        "supplier_name": supplier.get("name", ""),
        "customer_name": customer.get("name", ""),
        "invoice_date": header.get("invoice_date", ""),
        "currency": currency,
        "total_ht": round(total_ht, 3),
        "base_tva": round(base_tva, 3),
        "total_tva": round(total_tva, 3),
        "total_ttc": round(total_ttc, 3),
        "droit_timbre": round(droit_timbre, 3),
        "calculated_total_without_timbre": round(calculated_total, 3),
        "items_count": len(items),
        "teif_version": TEIF_VERSION
    }

    return xml_content, meta


# ============================================================
# ROUTES
# ============================================================

@app.route("/generate", methods=["POST"])
def generate_teif():
    try:
        body = request.get_json(silent=True)

        if not body:
            return jsonify({
                "success": False,
                "error": "Body JSON manquant"
            }), 400

        normalized = normalize_input_to_internal(body)

        header = normalized.get("header", {}) or {}
        items = normalized.get("items", []) or []
        footer = normalized.get("footer", {}) or {}

        xml_content, meta = build_teif_xml(header, items, footer)

        return jsonify({
            "success": True,
            "xml_content": xml_content,
            "invoice_number": meta["invoice_number"],
            "supplier_name": meta["supplier_name"],
            "customer_name": meta["customer_name"],
            "invoice_date": meta["invoice_date"],
            "currency": meta["currency"],
            "total_ht": meta["total_ht"],
            "base_tva": meta["base_tva"],
            "total_tva": meta["total_tva"],
            "total_ttc": meta["total_ttc"],
            "droit_timbre": meta["droit_timbre"],
            "calculated_total_without_timbre": meta["calculated_total_without_timbre"],
            "items_count": meta["items_count"],
            "teif_version": meta["teif_version"],
            "generation_timestamp": datetime.utcnow().isoformat()
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "teif-api",
        "port": PORT,
        "teif_version": TEIF_VERSION
    })


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "teif-api",
        "status": "running",
        "teif_version": TEIF_VERSION,
        "routes": [
            "GET /health",
            "POST /generate"
        ]
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=False
    )