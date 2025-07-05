# **App Name**: IP Address Manager

## Core Features:

- IP Address Form: Display an IP address management form with fields for IP address, subnet mask, gateway, DNS servers, description, source port and destination port.
- IP Address List: Display the list of configured IP addresses with an indicator if source and destination port are set for an IP Address.
- Single IP Address Deletion: Select one IP Address from the list to trigger the Single IP Address Deletion functionality.
- Deletion Confirmation & Error Handling: Implement confirmation message when deleting to protect data from unexpected destruction. Show error if delete is prevented, like when the source and/or destination port have associated data.
- Bulk IP Address Deletion: Select multiple IP Addresses from the list to trigger the Bulk IP Address Deletion functionality.
- Bulk Deletion Confirmation & Error Handling: Implement confirmation message when deleting to protect data from unexpected destruction. Show error if delete is prevented, like when the source and/or destination port have associated data.

## Style Guidelines:

- Primary color: Dark slate blue (#483D8B), reminiscent of server rooms, control panels and networking gear. Provides a professional feel.
- Background color: Light gray (#E0E0E0), providing a neutral backdrop for the IP address information.
- Accent color: Soft lavender (#C4A4D6), offering visual interest while remaining professional.
- Font pairing: 'Inter' (sans-serif) for both headlines and body text.
- Use simple, outlined icons for actions like 'add', 'delete', and 'edit'.
- Maintain a clean and structured layout, using grid system, with a sidebar for navigation and a main content area for displaying IP address information.
- Subtle transitions on form elements, buttons.