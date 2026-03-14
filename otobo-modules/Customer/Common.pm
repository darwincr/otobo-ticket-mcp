# --
# OTOBO is a web-based ticketing system for service organisations.
# --
# Copyright (C) 2019-2025 Rother OSS GmbH, https://otobo.io/
# --
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later version.
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
# --

package Kernel::GenericInterface::Operation::Customer::Common;

use strict;
use warnings;

# OTOBO modules
use Kernel::System::VariableCheck qw(IsHashRefWithData);

our $ObjectManagerDisabled = 1;

=head1 NAME

Kernel::GenericInterface::Operation::Customer::Common - Base class for Customer operations

=head1 PUBLIC INTERFACE

=head2 Init()

Initialize the operation by validating the web service configuration.

    my $Result = $CommonObject->Init(
        WebserviceID => 1,
    );

returns:

    $Result = {
        Success      => 1,                       # or 0 in case of failure
        ErrorMessage => 'Error Message',         # only on failure
    }

=cut

sub Init {
    my ( $Self, %Param ) = @_;

    if ( !$Param{WebserviceID} ) {
        return {
            Success      => 0,
            ErrorMessage => 'Got no WebserviceID!',
        };
    }

    my $Webservice = $Kernel::OM->Get('Kernel::System::GenericInterface::Webservice')->WebserviceGet(
        ID => $Param{WebserviceID},
    );

    if ( !IsHashRefWithData($Webservice) ) {
        return {
            Success      => 0,
            ErrorMessage => 'Could not determine Web service configuration',
        };
    }

    # Keep for later use if needed.
    $Self->{Webservice} = $Webservice;

    return {
        Success => 1,
    };
}

1;
