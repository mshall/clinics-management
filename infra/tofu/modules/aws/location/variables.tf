variable "enabled" {
  description = "Create the Amazon Location resources. Default false: the maps/route adapter runs in MOCK mode (CLAUDE.md mock-providers rule, KIORLY_PROVIDER_MODE=mock) and needs no AWS resource. Flip to true only in the 'Provider go-live' pass, staging first."
  type        = bool
  default     = false
}

variable "name" {
  description = "Name prefix (<product>-<env>); Location resource names allow letters, digits, - . _ only."
  type        = string
}

variable "map_style" {
  description = "Map style of the map resource (field-visit route view, KX-05 clinic.home_route_view). Must match the chosen data provider."
  type        = string
  default     = "VectorEsriNavigation"
}

variable "route_data_source" {
  description = "Route calculator data provider: Esri | Here | Grab. Verify coverage and terms for Egypt before go-live (NEEDS_HUMAN)."
  type        = string
  default     = "Esri"
  validation {
    condition     = contains(["Esri", "Here", "Grab"], var.route_data_source)
    error_message = "route_data_source must be Esri, Here or Grab."
  }
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
