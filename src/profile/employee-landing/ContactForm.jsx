import React, { useState } from 'react';
import { contacts as contactsApi } from '@/api/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { CheckCircle2, Phone, Mail, MessageSquare } from 'lucide-react';

const SERVICE_OPTIONS = [
  { value: 'roof_inspection', label: 'Roof Inspection' },
  { value: 'roof_repair', label: 'Roof Repair' },
  { value: 'roof_replacement', label: 'Roof Replacement' },
  { value: 'storm_damage', label: 'Storm Damage' },
  { value: 'siding', label: 'Siding' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'windows_doors', label: 'Windows & Doors' },
  { value: 'solar', label: 'Solar' },
  { value: 'other', label: 'Other' },
];

const ContactForm = ({ employee }) => {
  const [formData, setFormData] = useState({
    homeowner_name: '',
    homeowner_email: '',
    homeowner_phone: '',
    street_address: '',
    city: '',
    state: '',
    zip: '',
    service: '',
    preferred_contact: 'phone',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Input validation
      const sanitizedName = formData.homeowner_name?.trim();
      const sanitizedEmail = formData.homeowner_email?.trim().toLowerCase();
      const sanitizedPhone = formData.homeowner_phone?.trim();
      const sanitizedMessage = formData.message?.trim();

      if (!sanitizedName || !sanitizedEmail) {
        toast.error("Name and email are required.");
        setLoading(false);
        return;
      }

      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(sanitizedEmail)) {
        toast.error("Please enter a valid email address.");
        setLoading(false);
        return;
      }

      // Combine address fields
      const addressParts = [
        formData.street_address?.trim(),
        formData.city?.trim(),
        formData.state?.trim(),
        formData.zip?.trim()
      ].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

      // Build message with preferred contact method
      let enrichedMessage = sanitizedMessage || '';
      if (formData.preferred_contact) {
        const contactLabels = { phone: 'Phone', email: 'Email', text: 'Text' };
        enrichedMessage = `[Preferred Contact: ${contactLabels[formData.preferred_contact]}]\n\n${enrichedMessage}`;
      }

      await contactsApi.submit({
        name: sanitizedName,
        email: sanitizedEmail,
        phone: sanitizedPhone || null,
        address: fullAddress,
        service: formData.service || null,
        message: enrichedMessage || null,
        employee_id: employee?.id || null,
        status: 'new',
      });

      // Show success state
      setSubmitted(true);
      toast.success("Thank you! Your request has been submitted.");

    } catch (error) {
      console.error('Submission error:', error);
      toast.error("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Success confirmation screen
  if (submitted) {
    return (
      <section id="contact-form" className="py-12 bg-transparent">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-card rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
            </div>
            <h2 className="text-3xl font-bold mb-4 text-green-600">
              Thank You!
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Your request has been submitted successfully.
              {employee && ` ${employee.name} will contact you soon!`}
            </p>
            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground">
                We typically respond within 24 hours. If you need immediate assistance, please call us directly.
              </p>
            </div>
            <Button
              onClick={() => {
                setSubmitted(false);
                setFormData({
                  homeowner_name: '',
                  homeowner_email: '',
                  homeowner_phone: '',
                  street_address: '',
                  city: '',
                  state: '',
                  zip: '',
                  service: '',
                  preferred_contact: 'phone',
                  message: '',
                });
              }}
              variant="outline"
            >
              Submit Another Request
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact-form" className="py-12 bg-transparent">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-card rounded-lg shadow-lg p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8">
            Request Your Free Estimate{employee ? ` with ${employee.name}` : ''}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name & Email Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="homeowner_name" className="text-sm font-medium">Name *</Label>
                <Input
                  id="homeowner_name"
                  value={formData.homeowner_name}
                  onChange={(e) => setFormData({...formData, homeowner_name: e.target.value})}
                  placeholder="John Doe"
                  required
                  maxLength={100}
                  className="h-12 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="homeowner_email" className="text-sm font-medium">Email *</Label>
                <Input
                  id="homeowner_email"
                  type="email"
                  value={formData.homeowner_email}
                  onChange={(e) => setFormData({...formData, homeowner_email: e.target.value})}
                  placeholder="john@example.com"
                  required
                  maxLength={255}
                  className="h-12 mt-1"
                />
              </div>
            </div>

            {/* Phone & Service Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="homeowner_phone" className="text-sm font-medium">Phone Number</Label>
                <Input
                  id="homeowner_phone"
                  type="tel"
                  value={formData.homeowner_phone}
                  onChange={(e) => setFormData({...formData, homeowner_phone: e.target.value})}
                  placeholder="(555) 123-4567"
                  maxLength={20}
                  className="h-12 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="service" className="text-sm font-medium">Service Needed</Label>
                <Select
                  value={formData.service}
                  onValueChange={(value) => setFormData({...formData, service: value})}
                >
                  <SelectTrigger className="h-12 mt-1">
                    <SelectValue placeholder="Select a service..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="street_address" className="text-sm font-medium">Street Address</Label>
                <Input
                  id="street_address"
                  value={formData.street_address}
                  onChange={(e) => setFormData({...formData, street_address: e.target.value})}
                  placeholder="123 Main Street"
                  maxLength={200}
                  className="h-12 mt-1"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2 md:col-span-2">
                  <Label htmlFor="city" className="text-sm font-medium">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    placeholder="City"
                    maxLength={100}
                    className="h-12 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="state" className="text-sm font-medium">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                    placeholder="CA"
                    maxLength={2}
                    className="h-12 mt-1 uppercase"
                  />
                </div>
                <div>
                  <Label htmlFor="zip" className="text-sm font-medium">ZIP</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={(e) => setFormData({...formData, zip: e.target.value})}
                    placeholder="12345"
                    maxLength={10}
                    className="h-12 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Preferred Contact Method */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Preferred Contact Method</Label>
              <RadioGroup
                value={formData.preferred_contact}
                onValueChange={(value) => setFormData({...formData, preferred_contact: value})}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="phone" id="contact_phone" />
                  <Label htmlFor="contact_phone" className="flex items-center gap-1 cursor-pointer">
                    <Phone className="w-4 h-4" /> Phone
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="contact_email" />
                  <Label htmlFor="contact_email" className="flex items-center gap-1 cursor-pointer">
                    <Mail className="w-4 h-4" /> Email
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="text" id="contact_text" />
                  <Label htmlFor="contact_text" className="flex items-center gap-1 cursor-pointer">
                    <MessageSquare className="w-4 h-4" /> Text
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Message */}
            <div>
              <Label htmlFor="message" className="text-sm font-medium">Additional Details</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Tell us about your project, any specific concerns, or preferred times for contact..."
                rows={4}
                maxLength={1000}
                className="mt-1"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
            >
              {loading ? 'Submitting...' : 'Request Free Estimate'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              By submitting this form, you agree to be contacted about our services.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
