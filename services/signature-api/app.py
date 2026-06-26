from flask import Flask, request, jsonify
from lxml import etree

from signxml.xades import (
    XAdESSigner,
    XAdESDataObjectFormat,
)

app = Flask(__name__)

with open("/app/certs/private_key.pem", "rb") as f:
    PRIVATE_KEY = f.read()

with open("/app/certs/certificate.pem", "rb") as f:
    CERTIFICATE = f.read()

@app.route("/sign", methods=["POST"])
def sign():

    try:

        data = request.json

        xml_content = data.get(
            "xml_content",
            ""
        )

        root = etree.fromstring(
            xml_content.encode("utf-8")
        )

        signer = XAdESSigner(
            data_object_format=XAdESDataObjectFormat(
                Description="TEIF Invoice",
                MimeType="text/xml"
            )
        )

        signed_root = signer.sign(
            root,
            key=PRIVATE_KEY,
            cert=CERTIFICATE
        )

        xml_signed = etree.tostring(
            signed_root,
            pretty_print=True,
            encoding="utf-8",
            xml_declaration=True
        ).decode()

        return jsonify({
            "signed": True,
            "xml_signed": xml_signed
        })

    except Exception as e:

        return jsonify({
            "signed": False,
            "error": str(e)
        }), 500


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5001
    )
