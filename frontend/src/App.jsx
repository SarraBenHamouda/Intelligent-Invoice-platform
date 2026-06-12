import { useState } from "react";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import SearchCard from "./components/SearchCard";
import ValidationCard from "./components/ValidationCard";
import InvoiceDetails from "./components/InvoiceDetails";
import InvoiceTable from "./components/InvoiceTable";
import StatsCards from "./components/StatsCards";
import AlertsPanel from "./components/AlertsPanel";
import PipelineTimeline from "./components/PipelineTimeline";

function App() {

  const [invoiceData, setInvoiceData] = useState(null);
  const [validation, setValidation] = useState(null);

  return (
    <>

      <video autoPlay muted loop id="bg-video">
        <source src="background.mp4" type="video/mp4" />
      </video>

      <div className="overlay"></div>

      <Navbar />

      <main>

        <Hero />

        <StatsCards />

        <PipelineTimeline />

        <SearchCard
          setInvoiceData={setInvoiceData}
          setValidation={setValidation}
        />

        {
          invoiceData && (
            <>

              <ValidationCard validation={validation} />

              <AlertsPanel validation={validation} />

              <InvoiceDetails invoice={invoiceData[0]} />

              <InvoiceTable lines={invoiceData} />

            </>
          )
        }

      </main>

    </>
  );
}

export default App;