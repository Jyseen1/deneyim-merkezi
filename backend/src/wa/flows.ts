// WhatsApp Flow v5.0 — rezervasyon talebi formu.
// Bu obje hem runtime'da (referans icin) hem flow-definition.json olarak
// Meta Flow Builder'a yuklenebilir. Iki dosyayi senkronize tutun.

export const flowJson = {
  version: "5.0",
  data_api_version: "3.0",
  routing_model: {
    TARIH_SAAT: ["BILGILER"],
    BILGILER: ["OZET"],
    OZET: [],
  },
  screens: [
    {
      id: "TARIH_SAAT",
      title: "Tarih ve Saat",
      data: {
        available_slots: {
          type: "array",
          __example__: [
            { id: "14:00", title: "14:00 - 16:00" },
          ],
        },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "DatePicker",
            name: "visit_date",
            label: "Ziyaret tarihi",
            required: true,
            "on-select-action": {
              name: "data_exchange",
              payload: { visit_date: "${form.visit_date}" },
            },
          },
          {
            type: "Dropdown",
            name: "start_time",
            label: "Müsait saatler",
            required: true,
            "data-source": "${data.available_slots}",
          },
          {
            type: "Dropdown",
            name: "duration",
            label: "Ziyaret süresi",
            required: true,
            "data-source": [
              { id: "60", title: "1 saat" },
              { id: "90", title: "1.5 saat" },
              { id: "120", title: "2 saat" },
              { id: "150", title: "2.5 saat" },
              { id: "180", title: "3 saat" },
            ],
          },
          {
            type: "Footer",
            label: "İleri",
            "on-click-action": {
              name: "navigate",
              next: { type: "screen", name: "BILGILER" },
              payload: {
                visit_date: "${form.visit_date}",
                start_time: "${form.start_time}",
                duration: "${form.duration}",
              },
            },
          },
        ],
      },
    },
    {
      id: "BILGILER",
      title: "Bilgileriniz",
      data: {
        visit_date: { type: "string", __example__: "2026-05-28" },
        start_time: { type: "string", __example__: "14:00" },
        duration: { type: "string", __example__: "120" },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextInput",
            name: "visitor_name",
            label: "Ad Soyad",
            required: true,
          },
          {
            type: "TextInput",
            name: "visitor_phone",
            label: "Telefon",
            "input-type": "phone",
            required: true,
          },
          {
            type: "TextInput",
            name: "group_size",
            label: "Kişi sayısı",
            "input-type": "number",
            required: true,
          },
          {
            type: "TextArea",
            name: "note",
            label: "Not (isteğe bağlı)",
            required: false,
          },
          {
            type: "Footer",
            label: "İleri",
            "on-click-action": {
              name: "navigate",
              next: { type: "screen", name: "OZET" },
              payload: {
                visit_date: "${data.visit_date}",
                start_time: "${data.start_time}",
                duration: "${data.duration}",
                visitor_name: "${form.visitor_name}",
                visitor_phone: "${form.visitor_phone}",
                group_size: "${form.group_size}",
                note: "${form.note}",
              },
            },
          },
        ],
      },
    },
    {
      id: "OZET",
      title: "Özet ve Onay",
      terminal: true,
      data: {
        visit_date: { type: "string", __example__: "2026-05-28" },
        start_time: { type: "string", __example__: "14:00" },
        duration: { type: "string", __example__: "120" },
        visitor_name: { type: "string", __example__: "Ahmet" },
        visitor_phone: { type: "string", __example__: "+905551234567" },
        group_size: { type: "string", __example__: "3" },
        note: { type: "string", __example__: "" },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextHeading",
            text: "Rezervasyon özeti",
          },
          {
            type: "TextBody",
            text: "Tarih: ${data.visit_date}\nSaat: ${data.start_time}\nKişi: ${data.group_size}",
          },
          {
            type: "TextCaption",
            text: "Talebiniz yetkiliye iletilecek. Onaylandığında WhatsApp'tan bilgilendirileceksiniz.",
          },
          {
            type: "Footer",
            label: "Rezervasyon talebi gönder",
            "on-click-action": {
              name: "complete",
              payload: {
                visit_date: "${data.visit_date}",
                start_time: "${data.start_time}",
                duration: "${data.duration}",
                visitor_name: "${data.visitor_name}",
                visitor_phone: "${data.visitor_phone}",
                group_size: "${data.group_size}",
                note: "${data.note}",
              },
            },
          },
        ],
      },
    },
  ],
} as const;

export type FlowJson = typeof flowJson;
